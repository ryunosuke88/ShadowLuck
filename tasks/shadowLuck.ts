import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:shadowluck-address", "Print ShadowLuck and slWETH addresses").setAction(async (_args: TaskArguments, hre) => {
  const { deployments } = hre;
  const shadowLuck = await deployments.get("ShadowLuck");
  const slWETH = await deployments.get("ShadowLuckWETH");

  console.log(`ShadowLuck:   ${shadowLuck.address}`);
  console.log(`ShadowLuckWETH: ${slWETH.address}`);
});

task("task:decrypt-score", "Decrypt the caller score on ShadowLuck")
  .addOptionalParam("player", "Address to query, defaults to first signer")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const shadowLuckDeployment = await deployments.get("ShadowLuck");
    const contract = await ethers.getContractAt("ShadowLuck", shadowLuckDeployment.address);
    const signers = await ethers.getSigners();
    const playerAddress = taskArguments.player ?? signers[0].address;

    const encryptedScore = await contract.getEncryptedScore(playerAddress);
    if (encryptedScore === ethers.ZeroHash) {
      console.log("Encrypted score is empty; returning 0");
      return;
    }

    const clearScore = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedScore,
      shadowLuckDeployment.address,
      signers[0],
    );

    console.log(`Encrypted score: ${encryptedScore}`);
    console.log(`Clear score    : ${clearScore}`);
  });

task("task:buy-ticket", "Buy a ShadowLuck ticket with two numbers")
  .addParam("first", "First number (1-9)")
  .addParam("second", "Second number (1-9)")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { deployments, ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const first = Number(taskArguments.first);
    const second = Number(taskArguments.second);
    if (![first, second].every((num) => Number.isInteger(num) && num >= 1 && num <= 9)) {
      throw new Error("Ticket numbers must be integers between 1 and 9");
    }

    const deployment = await deployments.get("ShadowLuck");
    const contract = await ethers.getContractAt("ShadowLuck", deployment.address);
    const signer = (await ethers.getSigners())[0];

    const input = await fhevm.createEncryptedInput(deployment.address, signer.address);
    input.add8(first);
    input.add8(second);
    const encrypted = await input.encrypt();

    const tx = await contract
      .connect(signer)
      .buyTicket(encrypted.handles[0], encrypted.handles[1], encrypted.inputProof, { value: ethers.parseEther("0.001") });
    console.log(`Buying ticket tx: ${tx.hash}`);
    await tx.wait();
    console.log("Ticket submitted");
  });

task("task:play-round", "Draw numbers and settle rewards")
  .addOptionalParam("address", "Optional ShadowLuck address override")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { deployments, ethers } = hre;
    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ShadowLuck");

    const contract = await ethers.getContractAt("ShadowLuck", deployment.address);
    const signer = (await ethers.getSigners())[0];
    const tx = await contract.connect(signer).playRound();
    console.log(`Drawing numbers tx: ${tx.hash}`);
    await tx.wait();
    console.log("Round completed");
  });
