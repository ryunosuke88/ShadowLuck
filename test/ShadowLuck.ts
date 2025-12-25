import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ShadowLuck, ShadowLuckWETH, ShadowLuck__factory, ShadowLuckWETH__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

describe("ShadowLuck", function () {
  let signers: Signers;
  let lottery: ShadowLuck;
  let rewardToken: ShadowLuckWETH;
  let lotteryAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite only runs on the mock fhEVM");
      this.skip();
    }

    const wethFactory = (await ethers.getContractFactory("ShadowLuckWETH")) as ShadowLuckWETH__factory;
    rewardToken = (await wethFactory.deploy(signers.deployer.address)) as ShadowLuckWETH;
    await rewardToken.waitForDeployment();

    const lotteryFactory = (await ethers.getContractFactory("ShadowLuck")) as ShadowLuck__factory;
    lottery = (await lotteryFactory.deploy(await rewardToken.getAddress())) as ShadowLuck;
    await lottery.waitForDeployment();
    lotteryAddress = await lottery.getAddress();

    await rewardToken.connect(signers.deployer).setMinter(lotteryAddress);
  });

  it("stores encrypted picks and settles rewards", async function () {
    const firstPick = 3;
    const secondPick = 7;

    const encryptedInput = await fhevm
      .createEncryptedInput(lotteryAddress, signers.alice.address)
      .add8(firstPick)
      .add8(secondPick)
      .encrypt();

    const buyTx = await lottery
      .connect(signers.alice)
      .buyTicket(encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof, {
        value: ethers.parseEther("0.001"),
      });
    await buyTx.wait();

    const ticket = await lottery.getTicket(signers.alice.address);
    const clearFirstPick = await fhevm.userDecryptEuint(FhevmType.euint8, ticket[0], lotteryAddress, signers.alice);
    const clearSecondPick = await fhevm.userDecryptEuint(FhevmType.euint8, ticket[1], lotteryAddress, signers.alice);
    expect(clearFirstPick).to.eq(firstPick);
    expect(clearSecondPick).to.eq(secondPick);
    expect(ticket[2]).to.eq(true);

    const playTx = await lottery.connect(signers.alice).playRound();
    await playTx.wait();

    const result = await lottery.getLastResult(signers.alice.address);
    const drawOne = await fhevm.userDecryptEuint(FhevmType.euint8, result[0], lotteryAddress, signers.alice);
    const drawTwo = await fhevm.userDecryptEuint(FhevmType.euint8, result[1], lotteryAddress, signers.alice);
    const rewardDecrypted = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      result[2],
      lotteryAddress,
      signers.alice,
    );

    const drawOneValue = BigInt(drawOne);
    const drawTwoValue = BigInt(drawTwo);
    const pickOneValue = BigInt(firstPick);
    const pickTwoValue = BigInt(secondPick);

    const firstMatch = drawOneValue === pickOneValue || drawTwoValue === pickOneValue;
    const secondMatch = drawOneValue === pickTwoValue || drawTwoValue === pickTwoValue;
    const expectedReward = firstMatch && secondMatch ? 10_000_000_000_000_000n : firstMatch || secondMatch ? 1_000_000_000_000_000n : 0n;

    expect(rewardDecrypted).to.eq(expectedReward);
    expect(result[3]).to.eq(1n);
    expect(result[4]).to.eq(false);

    const encryptedScore = await lottery.getEncryptedScore(signers.alice.address);
    const clearScore = await fhevm.userDecryptEuint(FhevmType.euint64, encryptedScore, lotteryAddress, signers.alice);
    expect(clearScore).to.eq(expectedReward);

    const encryptedBalance = await rewardToken.confidentialBalanceOf(signers.alice.address);
    if (encryptedBalance === ethers.ZeroHash) {
      expect(expectedReward).to.eq(0n);
    } else {
      const clearBalance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        encryptedBalance,
        await rewardToken.getAddress(),
        signers.alice,
      );
      expect(clearBalance).to.eq(expectedReward);
    }
  });
});
