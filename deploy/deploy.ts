import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  if (!deployer) {
    throw new Error("Missing deployer account. Set PRIVATE_KEY in .env");
  }
  const { deploy } = hre.deployments;

  const wrappedEth = await deploy("ShadowLuckWETH", {
    from: deployer,
    args: [deployer],
    log: true,
  });

  const lottery = await deploy("ShadowLuck", {
    from: deployer,
    args: [wrappedEth.address],
    log: true,
  });

  const wethContract = await hre.ethers.getContractAt("ShadowLuckWETH", wrappedEth.address);
  const signer = await hre.ethers.getSigner(deployer);
  const currentMinter = await wethContract.minter();

  if (currentMinter !== lottery.address) {
    const tx = await wethContract.connect(signer).setMinter(lottery.address);
    await tx.wait();
    console.log(`Updated slWETH minter to ShadowLuck at ${lottery.address}`);
  }

  console.log(`ShadowLuck contract: ${lottery.address}`);
};
export default func;
func.id = "deploy_shadowluck";
func.tags = ["ShadowLuck"];
