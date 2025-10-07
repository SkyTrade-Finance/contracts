export async function latestBlockTime(ethers: any): Promise<number> {
  const b = await ethers.provider.getBlock("latest");
  return Number(b.timestamp);
}

export async function ensureUnpaused(sto: any, issuer: any): Promise<void> {
  try {
    await sto.connect(issuer).unpause();
  } catch {}
}

export async function deployAndRegisterMockPermit2(
  ethers: any,
  registry: any,
  deployer: any
): Promise<string> {
  const MockPermit2 = await ethers.getContractFactory("MockPermit2");
  const mock = await MockPermit2.connect(deployer).deploy();
  await mock.waitForDeployment();
  const addr = await mock.getAddress();
  await registry.connect(deployer).changeAddress("Permit2Contract", addr);
  return addr;
}
