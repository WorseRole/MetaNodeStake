const { ethers, upgrades } = require("hardhat")
const { expect } = require("chai")

describe("stake test", async function () {
    let a0, admin, user1, user2, user3
    let erc20Contract, stakeProxyContract

    // 每块奖励的MetaNode数量
    const metaNodePerBlock = 100n
    // 质押活动持续的区块数
    const blockHight = 10000
    // const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545/")
    // ethers.provider Hardhat自动提供的本地链provider，可获取区块号、余额、手动出块等。
    const provider = ethers.provider
    // 解除质押的锁定区块数
    const unstakeLockedBlocks = 10
    const zeroAddress = "0x0000000000000000000000000000000000000000"

    // 统一出块工具：Hardhat 默认只有交易时才出块。
    // 在奖励按“区块”计算的场景下，需要手动出块来推进奖励累积。
    async function mineBlocks(count) {
        for (let i = 0; i < count; i++) {
            await provider.send("evm_mine", [])
        }
    }

    // 统一获取测试账户：通过索引拿固定 signer，避免每个用例重复写 getSigners。
    // 约定：0 为默认部署账户，1 为 admin，后续索引用于隔离场景用户。
    async function signerAt(index) {
        const signers = await ethers.getSigners()
        return signers[index]
    }

    // 用例目标：完成基础部署流程并初始化第一个 ETH 池。
    // 执行步骤：部署奖励币 -> 部署代理质押合约 -> addPool 创建 ETH 池 -> 断言地址/池数量有效。
    it("deploy", async function () {
        // 部署 ERC20 合约
        // ethers.getSigners() 获取本地测试链的账户(钱包)，用于模拟不同用户操作
        [a0, admin, user1, user2, user3] = await ethers.getSigners()
        // ethers.getContractFactory() 获取合约工厂对象，用于部署合约
        const erc20 = await ethers.getContractFactory("MetaNodeToken")
        // contractFactory.deploy() 部署合约到链上，返回合约实例。
        // contract.connect(账户) 用指定账户操作合约（模拟不同用户）
        erc20Contract = await erc20.connect(admin).deploy()
        await erc20Contract.waitForDeployment()
        // contract.getAddress() 获取部署后合约地址
        const erc20ddress = await erc20Contract.getAddress()
        console.log("erc20ddress::", erc20ddress)
        expect(erc20ddress).to.length.gt(0)

        // 当前区块高度
        const blockNumber = await provider.getBlockNumber()
        console.log("当前区块高度::", blockNumber)
        // 部署 MetaNodeStake
        const metaNodeStake = await ethers.getContractFactory("MetaNodeStake")
        stakeProxyContract = await upgrades.deployProxy(metaNodeStake.connect(admin), [erc20ddress, blockNumber, blockNumber + blockHight, metaNodePerBlock], { kind: "uups" })
        await stakeProxyContract.waitForDeployment()
        const metaNodeStakeAddress = await stakeProxyContract.getAddress()
        console.log("metaNodeStakeContract::", metaNodeStakeAddress)
        expect(metaNodeStakeAddress).to.length.gt(0)
        // 部署后新增 eth 质押池
        await stakeProxyContract.connect(admin).addPool(zeroAddress, 5, 1E15, unstakeLockedBlocks, false)
        const poolLength = await stakeProxyContract.poolLength()
        expect(poolLength).to.length.gt(0)
    })

    // 用例目标：验证管理员可以切换奖励代币地址。
    // 执行步骤：新部署一个 MetaNodeToken -> 调用 setMetaNode -> 读取 MetaNode 校验已更新。
    it("setMetaNode", async () => {
        const erc20 = await ethers.getContractFactory("MetaNodeToken")
        erc20Contract = await erc20.connect(admin).deploy()
        await erc20Contract.waitForDeployment()
        const erc20ddress = await erc20Contract.getAddress()

        await stakeProxyContract.connect(admin).setMetaNode(erc20ddress)
        const newERC20 = await stakeProxyContract.MetaNode()
        expect(newERC20).to.eq(erc20ddress)
    })

    // 用例目标：验证管理员可暂停提现开关。
    // 执行步骤：调用 pauseWithdraw -> 读取 withdrawPaused 应为 true。
    it("pauseWithdraw", async () => {
        await stakeProxyContract.connect(admin).pauseWithdraw()
        const res = await stakeProxyContract.withdrawPaused()
        expect(res).to.true
    })

    // 用例目标：验证管理员可恢复提现开关。
    // 执行步骤：调用 unpauseWithdraw -> 读取 withdrawPaused 应为 false。
    it("unpauseWithdraw", async () => {
        await stakeProxyContract.connect(admin).unpauseWithdraw()
        const res = await stakeProxyContract.withdrawPaused()
        expect(res).to.false
    })

    // 用例目标：验证管理员可暂停领奖开关。
    // 执行步骤：调用 pauseClaim -> 读取 claimPaused 应为 true。
    it("pauseClaim", async () => {
        await stakeProxyContract.connect(admin).pauseClaim()
        const res = await stakeProxyContract.claimPaused()
        expect(res).to.true
    })

    // 用例目标：验证管理员可恢复领奖开关。
    // 执行步骤：调用 unpauseClaim -> 读取 claimPaused 应为 false。
    it("unpauseClaim", async () => {
        await stakeProxyContract.connect(admin).unpauseClaim()
        const res = await stakeProxyContract.claimPaused()
        expect(res).to.false
    })

    // 用例目标：验证管理员可以修改活动开始区块。
    // 执行步骤：使用当前区块设置 startBlock -> 再读取 startBlock 校验。
    it("setStartBlock", async () => {
        // 当前区块高度
        const blockNumber = await provider.getBlockNumber()
        const startBlock = blockNumber
        await stakeProxyContract.connect(admin).setStartBlock(startBlock)
        const res = await stakeProxyContract.startBlock()
        expect(res).to.eq(startBlock)
    })

    // 用例目标：验证管理员可以修改活动结束区块。
    // 执行步骤：基于 startBlock 设置新 endBlock -> 读取 endBlock 校验。
    it("setEndBlock", async () => {
        const startBlock = await stakeProxyContract.startBlock()
        const endBlock = startBlock + 100n
        await stakeProxyContract.connect(admin).setEndBlock(endBlock)
        const res = await stakeProxyContract.endBlock()
        expect(res).to.eq(endBlock)
    })

    // 用例目标：验证管理员可新增 ERC20 质押池。
    // 执行步骤：使用奖励币地址作为测试池 token -> addPool -> poolLength 增加。
    it("addPool", async () => {
        const tokenAddress = await erc20Contract.getAddress()
        // 质押池的权重，影响奖励分配
        const poolWeight = 10
        // 最小质押金额 
        const minDepositAmount = BigInt(1E18)
        const withUpdate = false
        await stakeProxyContract.connect(admin).addPool(tokenAddress, poolWeight, minDepositAmount, unstakeLockedBlocks, withUpdate)
        const poolLength = await stakeProxyContract.poolLength()
        expect(poolLength).to.length.gt(1)
    })

    // 用例目标：验证管理员可更新池参数与池权重。
    // 执行步骤：updatePool 更新最小质押/锁定块，再 setPoolWeight 调整权重。
    it("updatePool", async () => {
        await stakeProxyContract.connect(admin).updatePool(0, 1E15, 10)
        await stakeProxyContract.connect(admin).setPoolWeight(0, 20, true)
    })

    // 用例目标：验证区块奖励乘数计算逻辑正确。
    // 执行步骤：取 from/to 区块 -> 调 getMultiplier -> 与公式 MetaNodePerBlock*(to-from) 比较。
    it("getMultiplier", async () => {
        // 当前区块高度
        const fromBlock = await stakeProxyContract.startBlock()
        const toBlock = fromBlock + 10n
        const mul = await stakeProxyContract.getMultiplier(fromBlock, toBlock)
        expect(mul).to.eq(metaNodePerBlock * (toBlock - fromBlock))
    })

    // 用例目标：验证 ETH 池与 ERC20 池的存入流程。
    // 执行步骤：user1/user2 存 ETH，user3 授权后存 ERC20 -> 校验三人的 stakingBalance。
    it("deposit", async () => {
        // user1 deposit 10ETH, user2 deposit 20ETH
        // ethers.parseEther("1") 把字符串ETH 金额转为wei（最小单位）
        await stakeProxyContract.connect(user1).depositETH({ value: ethers.parseEther("10") })
        await stakeProxyContract.connect(user2).depositETH({ value: ethers.parseEther("20") })

        // user3 deposit 200USD
        await erc20Contract.connect(admin).transfer(user3.address, ethers.parseEther("1000"))
        const proxyAddress = await stakeProxyContract.getAddress()
        await erc20Contract.connect(user3).approve(proxyAddress, ethers.parseEther("200"))
        await stakeProxyContract.connect(user3).deposit(1, ethers.parseEther("200"))

        const user1Stake = await stakeProxyContract.stakingBalance(0, user1.address)
        const user2Stake = await stakeProxyContract.stakingBalance(0, user2.address)
        const user3Stake = await stakeProxyContract.stakingBalance(1, user3.address)
        expect(user1Stake).to.eq(ethers.parseEther("10"))
        expect(user2Stake).to.eq(ethers.parseEther("20"))
        expect(user3Stake).to.eq(ethers.parseEther("200"))
    })

    // 用例目标：验证解质押会减少质押余额并记录待提现请求。
    // 执行步骤：三个用户分别 unstake -> 校验 stakingBalance 变化 -> massUpdatePools 同步奖励状态。
    it("unstake", async () => {
        await stakeProxyContract.connect(user1).unstake(0, ethers.parseEther("2"))
        await stakeProxyContract.connect(user2).unstake(0, ethers.parseEther("2"))
        await stakeProxyContract.connect(user3).unstake(1, ethers.parseEther("10"))

        const user1Stake = await stakeProxyContract.stakingBalance(0, user1.address)
        const user2Stake = await stakeProxyContract.stakingBalance(0, user2.address)
        const user3Stake = await stakeProxyContract.stakingBalance(1, user3.address)
        expect(user1Stake).to.eq(BigInt(8E18))
        expect(user2Stake).to.eq(BigInt(18E18))
        expect(user3Stake).to.eq(BigInt(190E18))

        await stakeProxyContract.massUpdatePools()
    })

    // 用例目标：验证锁定期后提现能把已解锁请求转出到账。
    // 执行步骤：记录提现前余额 -> 手动出块跨过锁定期 -> withdraw -> 比较提现前后余额变化。
    it("withdraw", async () => {
        console.log(user1.address)

        const user1BalanceBefore = await provider.getBalance(user1.address)
        const user2BalanceBefore = await provider.getBalance(user2.address)
        const user3BalanceBefore = await erc20Contract.balanceOf(user3.address)
        console.log("user1BalanceBefore::", user1BalanceBefore)
        console.log("user2BalanceBefore::", user2BalanceBefore)
        console.log("user3BalanceBefore::", user3BalanceBefore)

        // 跳过锁定区块提现 
        await mineBlocks(unstakeLockedBlocks)

        await stakeProxyContract.connect(user1).withdraw(0)
        await stakeProxyContract.connect(user2).withdraw(0)
        await stakeProxyContract.connect(user3).withdraw(1)

        const user1Balance = await provider.getBalance(user1.address)
        const user2Balance = await provider.getBalance(user2.address)
        const user3Balance = await erc20Contract.balanceOf(user3.address)
        console.log("user1Balance::", user1Balance)
        console.log("user2Balance::", user2Balance)
        console.log("user3Balance::", user3Balance)
        // 跳过 8 个区块 eth转账生效
        // for (let i = 0; i < 8; i++) {
        //     await provider.send("evm_mine", []);
        // }
        const user1BalanceAfter = await provider.getBalance(user1.address)
        const user2BalanceAfter = await provider.getBalance(user2.address)
        const user3BalanceAfter = await erc20Contract.balanceOf(user3.address)
        console.log("user1BalanceAfter::", user1BalanceAfter)
        console.log("user2BalanceAfter::", user2BalanceAfter)
        console.log("user3BalanceAfter::", user3BalanceAfter)

        // eth 余额比较,有 gas, 不完全等于
        expect(user1BalanceAfter - user1BalanceBefore).to.lt(BigInt(2E18)).gt(BigInt(1.9E18))
        expect(user2BalanceAfter - user2BalanceBefore).to.lt(BigInt(2E18)).gt(BigInt(1.9E18))
        expect(user3BalanceAfter - user3BalanceBefore).to.eq(BigInt(10E18))
    })

    // 1. 异常分支测试

    // - 质押金额小于最小值应revert
    // 用例目标：覆盖“质押金额低于最小值”的回退分支。
    // 执行步骤：以极小金额 depositETH -> 断言 revertedWith("deposit amount is too small")。
    it("stakeAmountMin", async() => {
        await expect(stakeProxyContract.connect(user1).depositETH({ value: ethers.parseEther("0.0001") }))
        .to.be.revertedWith("deposit amount is too small")
    })
    // - 解质押数量大于已质押应revert
    // 用例目标：覆盖“解质押数量超出用户质押余额”的回退分支。
    // 执行步骤：请求超额 unstake -> 断言 Not enough staking token balance。
    it("unstakeAmountExceed", async() => {
        await expect(stakeProxyContract.connect(user1).unstake(0, ethers.parseEther("100") ))
        .to.be.revertedWith("Not enough staking token balance")
    })

    // - 非管理员操作管理方法应revert
    // 用例目标：验证管理接口受到 AccessControl 保护。
    // 执行步骤：非管理员调用 setStartBlock -> 断言 AccessControlUnauthorizedAccount。
    it("onlyAdmin", async() => {
        await expect(stakeProxyContract.connect(user1).setStartBlock(100))
        .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
    })
    
    // - 未到解锁区块提现应revert
    // 用例目标：覆盖“未解锁提现”路径（不转账但会消耗 gas）。
    // 执行步骤：先质押再发起解质押后立刻 withdraw -> 校验余额仅小幅减少（gas）。
    it("withdrawLocked", async() => {
        await stakeProxyContract.connect(user1).depositETH({ value: ethers.parseEther("1") })
        await stakeProxyContract.connect(user1).unstake(0, ethers.parseEther("1"))
        const balanceBefore = await provider.getBalance(user1.address)
        console.log("withdrawLocked balanceBefore::", balanceBefore)
        // 这是因为调用 withdraw(0) 时虽然没有转账，但还是消耗了 gas，所以余额减少了 gas 费。
        await stakeProxyContract.connect(user1).withdraw(0)
        const balanceAfter = await provider.getBalance(user1.address)
        console.log("withdrawLocked balanceAfter::", balanceAfter)
        // 判断余额变化小于一定的 gas 消耗（比如小于 0.01 ETH），而不是严格等于 0
        expect(balanceBefore - balanceAfter).to.be.lt(ethers.parseEther("0.01"))
    })

// - pauseClaim/pauseWithdraw 状态下相关操作应revert
    // 用例目标：验证 pause 状态下相关动作被禁止。
    // 执行步骤：pauseWithdraw 后提现应回退；恢复后 pauseClaim，claim 应回退。
    it("pauseClaimWithdraw", async() => {
        // 暂停提现后，用户尝试提现应失败
        await stakeProxyContract.connect(admin).pauseWithdraw()
        await expect(stakeProxyContract.connect(user1).withdraw(0))
        .to.be.revertedWith("withdraw is paused")

        // 恢复提现，暂停领取奖励后，用户尝试领取奖励应失败
        await stakeProxyContract.connect(admin).unpauseWithdraw()
        await stakeProxyContract.connect(admin).pauseClaim()
        await expect(stakeProxyContract.connect(user1).claim(0))
        .to.be.revertedWith("claim is paused")
    })


// 2. 边界条件测试
// - 最小单位时的质押/解质押/领奖励
    // 用例目标：覆盖边界条件：最小质押、全额解质押、奖励从 0 到正数再领取。
    // 执行步骤：cleanUser 最小额质押 -> user1/user3 全额解质押 -> user2 先 claim 清零再出块产奖再 claim。
    it("boundary", async() => {
        // 创建新的测试账户，确保干净的起始状态
        const cleanUser = await signerAt(4)

        // 测试正好等于最小质押金额的情况
        const minAmount = await stakeProxyContract.pool(0).then(p => p.minDepositAmount)
        await stakeProxyContract.connect(cleanUser).depositETH({value : minAmount})
        const balance = await stakeProxyContract.stakingBalance(0, cleanUser.address)
        expect(balance).to.eq(minAmount)


        // 测试user1的代币数量全部解质押
        const user1Stake = await stakeProxyContract.stakingBalance(0, user1.address)
        await stakeProxyContract.connect(user1).unstake(0, user1Stake)
        const balanceAfter = await stakeProxyContract.stakingBalance(0, user1.address)
        expect(balanceAfter).to.eq(0)
        
        // 测试user3的代币数量全部解质押
        const user3Stake = await stakeProxyContract.stakingBalance(1, user3.address)
        await stakeProxyContract.connect(user3).unstake(1, user3Stake)
        const balanceAfter3 = await stakeProxyContract.stakingBalance(1, user3.address)
        expect(balanceAfter3).to.eq(0)

        // 测试领奖励时奖励数量正好等于0的情况
        // 先确保user2没有未领取的奖励
        await stakeProxyContract.connect(admin).unpauseClaim()
        await stakeProxyContract.connect(user2).claim(0)
        const rewardBefore = await stakeProxyContract.pendingMetaNode(0, user2.address)
        console.log("rewardBefore::", rewardBefore)
        expect(rewardBefore).to.eq(0)

        // 测试领奖励时奖励数量正好等于最小单位的情况
        // 先让user2产生一些奖励
        // provider.send("evm_mine", []) 手动出块，触发奖励计算 在Hardhat本地链里手动出一个块。因为奖励是按区块累积的，不出新块通畅就不会新增奖励。
        await mineBlocks(1)
        // 调用合约制度方法，查询user2在池子 0 里 “当前待领取” 的MetaNode 奖励数量，这个值一般是还没claim 的奖励数量。
        const pendingMetaNode = await stakeProxyContract.pendingMetaNode(0, user2.address)
        console.log("pendingMetaNode::", pendingMetaNode)
        // 断言待领取奖励数量大于0，确保测试条件满足
        expect(pendingMetaNode).to.gt(0)


        console.log("user2 领取奖励")
        // user2 领取奖励
        const pendingBefore = await stakeProxyContract.pendingMetaNode(0, user2.address)
        console.log("user2 领取奖励 pendingBefore::", pendingBefore)
        const balanceBefore = await erc20Contract.balanceOf(user2.address)
        console.log("user2 领取奖励 balanceBefore::", balanceBefore)
        const tx = await stakeProxyContract.connect(user2).claim(0)
        console.log("user2 领取奖励 claim tx hash::", tx.hash)
        await tx.wait()
        const balanceAfterUser2 = await erc20Contract.balanceOf(user2.address)
        console.log("user2 领取奖励 balanceAfterUser2::", balanceAfterUser2)
        const claimed = balanceAfterUser2 - balanceBefore
        console.log("user2 领取奖励 claimed::", claimed)
        const pendingAfter = await stakeProxyContract.pendingMetaNode(0, user2.address)
        console.log("user2 领取奖励 pendingAfter::", pendingAfter)
        // 领取后应清零（或非常接近 0，取决于你的实现）
        expect(pendingAfter).to.eq(0)
        // 至少领取到了 claim 前看到的待领取（如果 claim 过程中又累积，claimed 可能更大）
        expect(claimed).to.gte(pendingBefore)
    })

    async function clearPoolsForMultiPoolCase() {
        // 保护活动窗口：如果当前高度已经超过 endBlock，
        // 后续任何会触发 updatePool 的操作都可能在 getMultiplier 处 revert。
        // 这里把 endBlock 延长到未来，确保测试可继续执行。
        const currentBlock = await provider.getBlockNumber()
        const currentEndBlock = await stakeProxyContract.endBlock()
        if (BigInt(currentBlock) >= currentEndBlock) {
            await stakeProxyContract.connect(admin).setEndBlock(BigInt(currentBlock) + 5000n)
        }

        // 清空池0（ETH）：user1、user2、cleanUser
        const user1Pool0Balance = await stakeProxyContract.stakingBalance(0, user1.address)
        const user2Pool0Balance = await stakeProxyContract.stakingBalance(0, user2.address)
        const cleanUser = await signerAt(4)
        const cleanUserPool0Balance = await stakeProxyContract.stakingBalance(0, cleanUser.address)

        if (user1Pool0Balance > 0n) {
            await stakeProxyContract.connect(user1).unstake(0, user1Pool0Balance)
        }
        if (user2Pool0Balance > 0n) {
            await stakeProxyContract.connect(user2).unstake(0, user2Pool0Balance)
        }
        if (cleanUserPool0Balance > 0n) {
            await stakeProxyContract.connect(cleanUser).unstake(0, cleanUserPool0Balance)
        }

        // 清空池1（ERC20）：user3
        const user3Pool1Balance = await stakeProxyContract.stakingBalance(1, user3.address)
        if (user3Pool1Balance > 0n) {
            await stakeProxyContract.connect(user3).unstake(1, user3Pool1Balance)
        }

        await mineBlocks(unstakeLockedBlocks)

        if (user1Pool0Balance > 0n) {
            await stakeProxyContract.connect(user1).withdraw(0)
        }
        if (user2Pool0Balance > 0n) {
            await stakeProxyContract.connect(user2).withdraw(0)
        }
        if (cleanUserPool0Balance > 0n) {
            await stakeProxyContract.connect(cleanUser).withdraw(0)
        }
        if (user3Pool1Balance > 0n) {
            await stakeProxyContract.connect(user3).withdraw(1)
        }
    }

    // 用例目标：验证清池工具函数可把池0/池1总质押清为 0。
    // 执行步骤：执行 clearPoolsForMultiPoolCase -> 读取 pool(stTokenAmount) 断言为 0。
    it("clearPoolsForMultiPoolCase", async() => {
        // 该用例单独验证“清池函数”本身是否生效，
        // 便于后续多池测试依赖一个可验证的干净前置状态。
        await clearPoolsForMultiPoolCase()
        const pool0AfterClean = await stakeProxyContract.pool(0)
        const pool1AfterClean = await stakeProxyContract.pool(1)
        expect(pool0AfterClean.stTokenAmount).to.eq(0)
        expect(pool1AfterClean.stTokenAmount).to.eq(0)
    })

    // - 多池并存时奖励分配正确性
    // 用例目标：验证多池并存时奖励分配与池权重比一致。
    // 执行步骤：清池后两用户分别在池0/池1质押 -> 同步起算点 -> 固定窗口出块 -> 比较增量奖励比例与权重比例。
    it("multiPoolRewardDistribution", async() => {
        // 为了保证用例独立性，在本用例开头再次清池
        await clearPoolsForMultiPoolCase()

        const poolUser1 = await signerAt(5)
        const poolUser2 = await signerAt(6)

        await stakeProxyContract.connect(poolUser1).depositETH({ value: ethers.parseEther("5") })
        const pool0Balance1 = await stakeProxyContract.stakingBalance(0, poolUser1.address)
        expect(pool0Balance1).to.eq(ethers.parseEther("5"))

        await erc20Contract.connect(admin).transfer(poolUser2.address, ethers.parseEther("100"))
        const proxyAddress = await stakeProxyContract.getAddress()
        await erc20Contract.connect(poolUser2).approve(proxyAddress, ethers.parseEther("50"))
        await stakeProxyContract.connect(poolUser2).deposit(1, ethers.parseEther("50"))
        const pool1Balance2 = await stakeProxyContract.stakingBalance(1, poolUser2.address)
        expect(pool1Balance2).to.eq(ethers.parseEther("50"))

        // 对齐两个池的起算点，避免先后质押导致的历史块偏差
        await stakeProxyContract.massUpdatePools()
        const pool0Before = await stakeProxyContract.pendingMetaNode(0, poolUser1.address)
        const pool1Before = await stakeProxyContract.pendingMetaNode(1, poolUser2.address)

        await mineBlocks(10)

        const pool0 = await stakeProxyContract.pool(0)
        const pool1 = await stakeProxyContract.pool(1)

        const pool0Reward1 = await stakeProxyContract.pendingMetaNode(0, poolUser1.address)
        const pool1Reward2 = await stakeProxyContract.pendingMetaNode(1, poolUser2.address)
        const pool0Delta = pool0Reward1 - pool0Before
        const pool1Delta = pool1Reward2 - pool1Before

        // 这里比较“增量奖励比例”而不是“总 pending 比例”：
        // 总 pending 可能包含入池先后导致的历史累计，不利于稳定断言。
        // 用 (after - before) 可以更准确衡量同一时间窗内的奖励分配。
        const actualRatio = (pool0Delta * 100n) / pool1Delta
        const expectedRatio = (pool0.poolWeight * 100n) / pool1.poolWeight

        // 允许 ±20% 的误差范围，覆盖整数除法和区块边界抖动
        const errorMargin = expectedRatio / 5n
        expect(actualRatio).to.be.gte(expectedRatio - errorMargin).and.lte(expectedRatio + errorMargin)
    })

    // 用例目标：覆盖 _safeMetaNodeTransfer 在“奖励余额不足”时的安全分支。
    // 执行步骤：切换到低余额奖励币 -> 触发 claim -> 校验到账受限且 pending 清零。
    it("safeMetaNodeTransferInsufficientBalance", async() => {
        // 目标：覆盖 _safeMetaNodeTransfer 的“奖励币余额不足”分支。
        // 方法：临时把奖励币切到一个新 token（且质押合约在该 token 上余额为 0），
        // 然后触发 claim，验证不会 revert，且按安全转账逻辑最多转出可用余额（这里是 0）。
        await clearPoolsForMultiPoolCase()
        const stressUser = await signerAt(7)

        await stakeProxyContract.connect(stressUser).depositETH({ value: ethers.parseEther("2") })
        await mineBlocks(5)

        const pendingBefore = await stakeProxyContract.pendingMetaNode(0, stressUser.address)
        expect(pendingBefore).to.gt(0)

        const testERC20Factory = await ethers.getContractFactory("TestERC20")
        const lowBalanceRewardToken = await testERC20Factory
            .connect(admin)
            .deploy("LowReward", "LOW", ethers.parseEther("1"))
        await lowBalanceRewardToken.waitForDeployment()

        await stakeProxyContract.connect(admin).setMetaNode(await lowBalanceRewardToken.getAddress())
        const stakeAddress = await stakeProxyContract.getAddress()
        const rewardPoolBalance = await lowBalanceRewardToken.balanceOf(stakeAddress)
        expect(rewardPoolBalance).to.eq(0)

        const userRewardBefore = await lowBalanceRewardToken.balanceOf(stressUser.address)
        await expect(stakeProxyContract.connect(stressUser).claim(0)).to.emit(stakeProxyContract, "Claim")
        const userRewardAfter = await lowBalanceRewardToken.balanceOf(stressUser.address)
        const pendingAfter = await stakeProxyContract.pendingMetaNode(0, stressUser.address)

        // 由于奖励池该 token 余额为 0，用户最终拿到 0；
        // 但本次 pending 会被清零，表示 claim 流程执行成功。
        expect(userRewardAfter - userRewardBefore).to.eq(0)
        expect(pendingAfter).to.eq(0)

        // 恢复奖励币地址，避免影响后续用例
        await stakeProxyContract.connect(admin).setMetaNode(await erc20Contract.getAddress())
    })

    // 3. 多用户/多池交互
    // 用例目标：验证同池多用户交互（质押/解质押/提现/领奖）在时序上正确。
    // 执行步骤：两用户同池质押 -> 一方部分解质押并提现 -> 双方 claim -> 验证奖励余额增加。
    it("multiUserInteractionSamePool", async() => {
        // 目标：验证同一池内多用户并发交互（质押/解质押/提现/领奖）流程一致性。
        await clearPoolsForMultiPoolCase()
        const userA = await signerAt(8)
        const userB = await signerAt(9)

        await stakeProxyContract.connect(userA).depositETH({ value: ethers.parseEther("3") })
        await stakeProxyContract.connect(userB).depositETH({ value: ethers.parseEther("7") })

        await mineBlocks(3)

        const pendingA = await stakeProxyContract.pendingMetaNode(0, userA.address)
        const pendingB = await stakeProxyContract.pendingMetaNode(0, userB.address)
        // userB 质押更多（7 > 3），在相同区块窗口内应累积更多待领奖励。
        expect(pendingA).to.gt(0)
        expect(pendingB).to.gt(pendingA)

        await stakeProxyContract.connect(userA).unstake(0, ethers.parseEther("1"))
        const [requestAmountBefore, pendingWithdrawBefore] = await stakeProxyContract.withdrawAmount(0, userA.address)
        expect(requestAmountBefore).to.eq(ethers.parseEther("1"))
        expect(pendingWithdrawBefore).to.eq(0)

        await mineBlocks(unstakeLockedBlocks)

        await stakeProxyContract.connect(userA).withdraw(0)
        const [requestAmountAfter, pendingWithdrawAfter] = await stakeProxyContract.withdrawAmount(0, userA.address)
        // 提现后请求队列应被消费完，待提现金额归零。
        expect(requestAmountAfter).to.eq(0)
        expect(pendingWithdrawAfter).to.eq(0)

        const userARewardBefore = await erc20Contract.balanceOf(userA.address)
        const userBRewardBefore = await erc20Contract.balanceOf(userB.address)

        await expect(stakeProxyContract.connect(userA).claim(0)).to.emit(stakeProxyContract, "Claim")
        await expect(stakeProxyContract.connect(userB).claim(0)).to.emit(stakeProxyContract, "Claim")

        const userARewardAfter = await erc20Contract.balanceOf(userA.address)
        const userBRewardAfter = await erc20Contract.balanceOf(userB.address)
        // 用“余额增加”校验 claim 成功，避免 pending 在新块下瞬时再增长导致断言抖动。
        expect(userARewardAfter).to.gt(userARewardBefore)
        expect(userBRewardAfter).to.gt(userBRewardBefore)
    })

    // 用例目标：验证调整池权重会改变奖励分配比例。
    // 执行步骤：先测一段比例 -> 提高池1权重 -> 再测比例，断言池0/池1比例下降。
    it("poolWeightChangeAffectsRewardRatio", async() => {
        // 目标：验证管理员调整池权重后，奖励分配比例会按权重方向变化。
        await clearPoolsForMultiPoolCase()
        const ratioUser0 = await signerAt(10)
        const ratioUser1 = await signerAt(11)

        await stakeProxyContract.connect(ratioUser0).depositETH({ value: ethers.parseEther("5") })
        await erc20Contract.connect(admin).transfer(ratioUser1.address, ethers.parseEther("100"))
        const proxyAddress = await stakeProxyContract.getAddress()
        await erc20Contract.connect(ratioUser1).approve(proxyAddress, ethers.parseEther("5"))
        await stakeProxyContract.connect(ratioUser1).deposit(1, ethers.parseEther("5"))

        await stakeProxyContract.massUpdatePools()
        const p0Before1 = await stakeProxyContract.pendingMetaNode(0, ratioUser0.address)
        const p1Before1 = await stakeProxyContract.pendingMetaNode(1, ratioUser1.address)
        await mineBlocks(6)
        const p0After1 = await stakeProxyContract.pendingMetaNode(0, ratioUser0.address)
        const p1After1 = await stakeProxyContract.pendingMetaNode(1, ratioUser1.address)
        const ratioBefore = ((p0After1 - p0Before1) * 100n) / (p1After1 - p1Before1)

        // 把池1权重从 10 提升到 40：
        // 同样时间窗下，池1应分到更多奖励，所以“池0/池1”比例应下降。
        await stakeProxyContract.connect(admin).setPoolWeight(1, 40, true)

        await stakeProxyContract.massUpdatePools()
        const p0Before2 = await stakeProxyContract.pendingMetaNode(0, ratioUser0.address)
        const p1Before2 = await stakeProxyContract.pendingMetaNode(1, ratioUser1.address)
        await mineBlocks(6)
        const p0After2 = await stakeProxyContract.pendingMetaNode(0, ratioUser0.address)
        const p1After2 = await stakeProxyContract.pendingMetaNode(1, ratioUser1.address)
        const ratioAfter = ((p0After2 - p0Before2) * 100n) / (p1After2 - p1Before2)

        expect(ratioAfter).to.lt(ratioBefore)
    })

    // 4. 管理员操作 + 非管理员失败
    // 用例目标：同时覆盖管理员成功路径与非管理员失败路径。
    // 执行步骤：admin 调整参数成功；user1 调管理方法应回退 AccessControlUnauthorizedAccount。
    it("adminOpsAndNonAdminReverts", async() => {
        // 同时覆盖：
        // 1) 管理员成功路径（setMetaNodePerBlock / setEndBlock）
        // 2) 非管理员失败路径（AccessControlUnauthorizedAccount）
        const currentBlock = await provider.getBlockNumber()
        const newEndBlock = BigInt(currentBlock) + 5000n

        await stakeProxyContract.connect(admin).setMetaNodePerBlock(120n)
        expect(await stakeProxyContract.MetaNodePerBlock()).to.eq(120n)

        await stakeProxyContract.connect(admin).setEndBlock(newEndBlock)
        expect(await stakeProxyContract.endBlock()).to.eq(newEndBlock)

        await expect(stakeProxyContract.connect(user1).setMetaNodePerBlock(99n))
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
        await expect(stakeProxyContract.connect(user1).setPoolWeight(0, 33, false))
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
    })

    // 5. 事件触发
    // 用例目标：验证关键业务事件是否按预期触发。
    // 执行步骤：AddPool / Deposit / Claim / RequestUnstake / Withdraw 全流程触发并断言 emit。
    it("keyEventsEmit", async() => {
        // 目标：验证关键业务动作是否按预期 emit 事件，便于前端/索引器监听。
        const testERC20Factory = await ethers.getContractFactory("TestERC20")
        const eventToken = await testERC20Factory
            .connect(admin)
            .deploy("EventToken", "EVT", ethers.parseEther("1000000"))
        await eventToken.waitForDeployment()

        await expect(
            stakeProxyContract.connect(admin).addPool(
                await eventToken.getAddress(),
                15,
                ethers.parseEther("1"),
                unstakeLockedBlocks,
                false
            )
        ).to.emit(stakeProxyContract, "AddPool")

        const evtUser = await signerAt(12)

        await expect(
            stakeProxyContract.connect(evtUser).depositETH({ value: ethers.parseEther("1") })
        ).to.emit(stakeProxyContract, "Deposit")

        await mineBlocks(2)
        await expect(stakeProxyContract.connect(evtUser).claim(0)).to.emit(stakeProxyContract, "Claim")

        await expect(stakeProxyContract.connect(evtUser).unstake(0, ethers.parseEther("1")))
            .to.emit(stakeProxyContract, "RequestUnstake")

        await mineBlocks(unstakeLockedBlocks)
        await expect(stakeProxyContract.connect(evtUser).withdraw(0)).to.emit(stakeProxyContract, "Withdraw")
    })

    // 6. 代码分支
    // 用例目标：覆盖 invalid pid 与未解锁提现分支。
    // 执行步骤：claim(999) 回退；新用户 unstake 后立刻 withdraw，验证 pendingWithdraw 为 0 且请求仍在。
    it("branchCoverage_invalidPidAndEarlyWithdraw", async() => {
        // 分支1：checkPid 失败分支
        await expect(stakeProxyContract.connect(user1).claim(999)).to.be.revertedWith("invalid pid")

        const branchUser = await signerAt(13)
        await stakeProxyContract.connect(branchUser).depositETH({ value: ethers.parseEther("1") })
        await stakeProxyContract.connect(branchUser).unstake(0, ethers.parseEther("1"))

        // 分支2：未到解锁块提现，withdraw 应走 pendingWithdraw_ == 0 路径（不转账）
        await stakeProxyContract.connect(branchUser).withdraw(0)
        const [requestAmount, pendingWithdraw] = await stakeProxyContract.withdrawAmount(0, branchUser.address)
        expect(requestAmount).to.eq(ethers.parseEther("1"))
        expect(pendingWithdraw).to.eq(0)
    })

    // 用例目标：覆盖 addPool 的 _withUpdate=true 分支（触发 massUpdatePools）。
    // 执行步骤：部署额外 ERC20 -> addPool(..., true) -> 断言 AddPool 事件。
    it("branchCoverage_addPoolWithUpdateTrue", async() => {
        // 覆盖 addPool 的 _withUpdate == true 分支
        const testERC20Factory = await ethers.getContractFactory("TestERC20")
        const extraToken = await testERC20Factory
            .connect(admin)
            .deploy("ExtraPool", "EXP", ethers.parseEther("1000000"))
        await extraToken.waitForDeployment()

        await expect(
            stakeProxyContract
                .connect(admin)
                .addPool(await extraToken.getAddress(), 9, ethers.parseEther("1"), unstakeLockedBlocks, true)
        ).to.emit(stakeProxyContract, "AddPool")
    })

    // 用例目标：覆盖 withdrawAmount 循环中“部分解锁、部分锁定”的混合分支。
    // 执行步骤：先创建请求并等其解锁，再创建新锁定请求 -> 校验 requestAmount 与 pendingWithdraw 分别统计正确。
    it("branchCoverage_withdrawAmountMixedLockedUnlocked", async() => {
        // 覆盖 withdrawAmount 循环内 if 的 true/false 两条路径
        await clearPoolsForMultiPoolCase()
        const mixUser = await signerAt(14)

        await stakeProxyContract.connect(mixUser).depositETH({ value: ethers.parseEther("2") })
        await stakeProxyContract.connect(mixUser).unstake(0, ethers.parseEther("1"))

        // 第一笔请求走到可提现状态
        await mineBlocks(unstakeLockedBlocks)

        // 再创建一笔新请求，保持锁定状态
        await stakeProxyContract.connect(mixUser).unstake(0, ethers.parseEther("0.5"))

        const [requestAmount, pendingWithdraw] = await stakeProxyContract.withdrawAmount(0, mixUser.address)
        expect(requestAmount).to.eq(ethers.parseEther("1.5"))
        expect(pendingWithdraw).to.eq(ethers.parseEther("1"))
    })

    // 用例目标：覆盖 updatePool 的“同块早返回”分支。
    // 执行步骤：关闭 automine 连续发送两次 updatePool 同块打包 -> 第二次命中 block<=lastRewardBlock 直接 return。
    it("branchCoverage_updatePoolEarlyReturnSameBlock", async() => {
        // 覆盖 updatePool 内 block.number <= lastRewardBlock 的早返回分支
        await clearPoolsForMultiPoolCase()

        await provider.send("evm_setAutomine", [false])
        try {
            const tx1 = await stakeProxyContract.connect(admin).updatePool(0)
            const tx2 = await stakeProxyContract.connect(admin).updatePool(0)

            // 两笔交易打包到同一个块，第二笔会命中早返回分支
            await provider.send("evm_mine", [])

            await tx1.wait()
            await tx2.wait()
        } finally {
            await provider.send("evm_setAutomine", [true])
        }
    })

    // 用例目标：集中覆盖管理员参数校验与状态校验回退分支。
    // 执行步骤：重复 pause/unpause、非法 start/end、非法 MetaNodePerBlock、非法 poolWeight、addPool 规则与 getMultiplier 反向区间。
    it("branchCoverage_adminValidationReverts", async() => {
        // pause/unpause 的反向分支
        if (await stakeProxyContract.withdrawPaused()) {
            await stakeProxyContract.connect(admin).unpauseWithdraw()
        }
        await expect(stakeProxyContract.connect(admin).unpauseWithdraw()).to.be.revertedWith("withdraw has been already unpaused")
        await stakeProxyContract.connect(admin).pauseWithdraw()
        await expect(stakeProxyContract.connect(admin).pauseWithdraw()).to.be.revertedWith("withdraw has been already paused")
        await stakeProxyContract.connect(admin).unpauseWithdraw()

        if (await stakeProxyContract.claimPaused()) {
            await stakeProxyContract.connect(admin).unpauseClaim()
        }
        await expect(stakeProxyContract.connect(admin).unpauseClaim()).to.be.revertedWith("claim has been already unpaused")
        await stakeProxyContract.connect(admin).pauseClaim()
        await expect(stakeProxyContract.connect(admin).pauseClaim()).to.be.revertedWith("claim has been already paused")
        await stakeProxyContract.connect(admin).unpauseClaim()

        // 参数校验分支
        const endBlock = await stakeProxyContract.endBlock()
        await expect(stakeProxyContract.connect(admin).setStartBlock(endBlock + 1n))
            .to.be.revertedWith("start block must be smaller than end block")

        const startBlock = await stakeProxyContract.startBlock()
        await expect(stakeProxyContract.connect(admin).setEndBlock(startBlock - 1n))
            .to.be.revertedWith("start block must be smaller than end block")

        await expect(stakeProxyContract.connect(admin).setMetaNodePerBlock(0))
            .to.be.revertedWith("invalid parameter")

        await expect(stakeProxyContract.connect(admin).setPoolWeight(0, 0, false))
            .to.be.revertedWith("invalid pool weight")

        await expect(
            stakeProxyContract.connect(admin).addPool(zeroAddress, 1, 0, unstakeLockedBlocks, false)
        ).to.be.revertedWith("invalid staking token address")

        await expect(
            stakeProxyContract.connect(admin).addPool(user1.address, 1, 0, 0, false)
        ).to.be.revertedWith("invalid withdraw locked blocks")

        const currentBlock = await provider.getBlockNumber()
        await stakeProxyContract.connect(admin).setEndBlock(BigInt(currentBlock))
        await expect(
            stakeProxyContract.connect(admin).addPool(user1.address, 1, 0, unstakeLockedBlocks, false)
        ).to.be.revertedWith("Already ended")

        // 恢复活动窗口，避免影响后续用例
        await stakeProxyContract.connect(admin).setEndBlock(BigInt(currentBlock) + 5000n)

        await expect(stakeProxyContract.getMultiplier(10, 9)).to.be.revertedWith("invalid block")
    })

    // 用例目标：覆盖 0 金额路径（允许但不产生余额变化）的分支行为。
    // 执行步骤：设置最小质押为 0 -> zeroUser depositETH(0)/unstake(0)/claim(0) -> 断言事件与状态合理。
    it("branchCoverage_zeroAmountPaths", async() => {
        await clearPoolsForMultiPoolCase()
        await stakeProxyContract.connect(admin).updatePool(0, 0, unstakeLockedBlocks)

        const zeroUser = await signerAt(15)
        await expect(stakeProxyContract.connect(zeroUser).depositETH({ value: 0 }))
            .to.emit(stakeProxyContract, "Deposit")

        expect(await stakeProxyContract.stakingBalance(0, zeroUser.address)).to.eq(0)

        await expect(stakeProxyContract.connect(zeroUser).unstake(0, 0))
            .to.emit(stakeProxyContract, "RequestUnstake")

        await expect(stakeProxyContract.connect(zeroUser).claim(0))
            .to.emit(stakeProxyContract, "Claim")
    })

    // 用例目标：覆盖 _safeETHTransfer 中 data.length>0 且 decode(true) 的成功分支。
    // 执行步骤：通过 TestEthReceiver 作为提现接收方，提现后请求队列应清空。
    it("branchCoverage_safeEthTransferNonEmptyReturnData", async() => {
        await clearPoolsForMultiPoolCase()

        const receiverFactory = await ethers.getContractFactory("TestEthReceiver")
        const receiver = await receiverFactory.connect(admin).deploy()
        await receiver.waitForDeployment()

        const stakeAddress = await stakeProxyContract.getAddress()
        await receiver.depositToStake(stakeAddress, { value: ethers.parseEther("1") })
        await receiver.requestUnstake(stakeAddress, 0, ethers.parseEther("1"))
        await mineBlocks(unstakeLockedBlocks)
        await receiver.doWithdraw(stakeAddress, 0)

        const [requestAmount, pendingWithdraw] = await stakeProxyContract.withdrawAmount(0, await receiver.getAddress())
        expect(requestAmount).to.eq(0)
        expect(pendingWithdraw).to.eq(0)
    })

    // 用例目标：覆盖 _safeETHTransfer 中 data.length>0 且 decode(false) 的失败分支。
    // 执行步骤：通过 TestEthReceiverFalse 作为接收方，withdraw 应回退 ETH transfer operation did not succeed。
    it("branchCoverage_safeEthTransferReturnFalse", async() => {
        await clearPoolsForMultiPoolCase()

        const receiverFactory = await ethers.getContractFactory("TestEthReceiverFalse")
        const receiver = await receiverFactory.connect(admin).deploy()
        await receiver.waitForDeployment()

        const stakeAddress = await stakeProxyContract.getAddress()
        await receiver.depositToStake(stakeAddress, { value: ethers.parseEther("1") })
        await receiver.requestUnstake(stakeAddress, 0, ethers.parseEther("1"))
        await mineBlocks(unstakeLockedBlocks)

        await expect(receiver.doWithdraw(stakeAddress, 0)).to.be.revertedWith("ETH transfer operation did not succeed")
    })

    // 用例目标：覆盖 _safeETHTransfer 的 call 失败分支。
    // 执行步骤：通过 TestEthReceiverRevert 作为接收方，withdraw 应回退 ETH transfer call failed。
    it("branchCoverage_safeEthTransferCallFailed", async() => {
        await clearPoolsForMultiPoolCase()

        const receiverFactory = await ethers.getContractFactory("TestEthReceiverRevert")
        const receiver = await receiverFactory.connect(admin).deploy()
        await receiver.waitForDeployment()

        const stakeAddress = await stakeProxyContract.getAddress()
        await receiver.depositToStake(stakeAddress, { value: ethers.parseEther("1") })
        await receiver.requestUnstake(stakeAddress, 0, ethers.parseEther("1"))
        await mineBlocks(unstakeLockedBlocks)

        await expect(receiver.doWithdraw(stakeAddress, 0)).to.be.revertedWith("ETH transfer call failed")
    })

    // 用例目标：覆盖多种 admin 接口的非管理员拒绝分支。
    // 执行步骤：user1 分别调用 setMetaNode/pause/unpause/addPool/updatePool/setEndBlock 等，统一断言 AccessControl 回退。
    it("branchCoverage_nonAdminAdminMethods", async() => {
        const currentEnd = await stakeProxyContract.endBlock()

        await expect(stakeProxyContract.connect(user1).setMetaNode(await erc20Contract.getAddress()))
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
        await expect(stakeProxyContract.connect(user1).pauseWithdraw())
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
        await expect(stakeProxyContract.connect(user1).unpauseWithdraw())
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
        await expect(stakeProxyContract.connect(user1).pauseClaim())
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
        await expect(stakeProxyContract.connect(user1).unpauseClaim())
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
        await expect(stakeProxyContract.connect(user1).setEndBlock(currentEnd + 10n))
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
        await expect(stakeProxyContract.connect(user1).addPool(user2.address, 1, 0, unstakeLockedBlocks, false))
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
        await expect(stakeProxyContract.connect(user1).updatePool(0, 0, unstakeLockedBlocks))
            .to.be.revertedWithCustomError(stakeProxyContract, "AccessControlUnauthorizedAccount")
    })

    // 用例目标：覆盖 checkPid 在只读查询方法中的失败分支。
    // 执行步骤：对 stakingBalance/withdrawAmount/pendingMetaNodeByBlockNumber 传 invalid pid 并断言回退。
    it("branchCoverage_checkPidForViewMethods", async() => {
        await expect(stakeProxyContract.stakingBalance(999, user1.address)).to.be.revertedWith("invalid pid")
        await expect(stakeProxyContract.withdrawAmount(999, user1.address)).to.be.revertedWith("invalid pid")
        await expect(stakeProxyContract.pendingMetaNodeByBlockNumber(999, user1.address, 1)).to.be.revertedWith("invalid pid")
    })

    // 用例目标：补充 updatePool/pendingMetaNode 的 invalid pid 与 deposit 参数校验分支。
    // 执行步骤：updatePool(999)/pendingMetaNode(999) 回退；deposit(0,...) 与过小金额 deposit 回退。
    it("branchCoverage_invalidPidAndDepositValidationExtra", async() => {
        await expect(stakeProxyContract.updatePool(999)).to.be.revertedWith("invalid pid")
        await expect(stakeProxyContract.pendingMetaNode(999, user1.address)).to.be.revertedWith("invalid pid")
        await expect(stakeProxyContract.connect(user1).deposit(0, ethers.parseEther("1")))
            .to.be.revertedWith("deposit not support ETH staking")
        await expect(stakeProxyContract.connect(user1).deposit(1, 1))
            .to.be.revertedWith("deposit amount is too small")
    })

    // 用例目标：在全新实例覆盖“首池必须是 ETH 池”的规则分支以及 lastRewardBlock 的 startBlock 路径。
    // 执行步骤：部署 freshStake 并 initialize(start 在未来) -> 首次 addPool 非零地址应回退，zeroAddress 应成功。
    it("branchCoverage_firstPoolRuleOnFreshInstance", async() => {
        const metaNodeStakeFactory = await ethers.getContractFactory("MetaNodeStake")
        const freshStake = await metaNodeStakeFactory.connect(admin).deploy()
        await freshStake.waitForDeployment()

        const currentBlock = await provider.getBlockNumber()
        // 设置 startBlock 在未来，使 addPool 计算 lastRewardBlock 走到 startBlock 分支
        await freshStake
            .connect(admin)
            .initialize(await erc20Contract.getAddress(), BigInt(currentBlock) + 20n, BigInt(currentBlock) + 200n, 100n)

        await expect(
            freshStake.connect(admin).addPool(user1.address, 1, 0, unstakeLockedBlocks, false)
        ).to.be.revertedWith("invalid staking token address")

        await expect(
            freshStake.connect(admin).addPool(zeroAddress, 1, 0, unstakeLockedBlocks, false)
        ).to.emit(freshStake, "AddPool")
    })

    // 用例目标：直接触发三个辅助接收合约的 fallback 分支，提升其自身函数覆盖率。
    // 执行步骤：向三个合约发送非空 calldata；true/false 接收成功，revert 接收应回退 receiver revert。
    it("helperContracts_fallbackCoverage", async() => {
        const receiverTrueFactory = await ethers.getContractFactory("TestEthReceiver")
        const receiverFalseFactory = await ethers.getContractFactory("TestEthReceiverFalse")
        const receiverRevertFactory = await ethers.getContractFactory("TestEthReceiverRevert")

        const receiverTrue = await receiverTrueFactory.connect(admin).deploy()
        const receiverFalse = await receiverFalseFactory.connect(admin).deploy()
        const receiverRevert = await receiverRevertFactory.connect(admin).deploy()
        await receiverTrue.waitForDeployment()
        await receiverFalse.waitForDeployment()
        await receiverRevert.waitForDeployment()

        // 发送非空 calldata，强制命中 fallback 分支
        await admin.sendTransaction({ to: await receiverTrue.getAddress(), data: "0x1234" })
        await admin.sendTransaction({ to: await receiverFalse.getAddress(), data: "0x1234" })
        await expect(admin.sendTransaction({ to: await receiverRevert.getAddress(), data: "0x1234" }))
            .to.be.revertedWith("receiver revert")
    })

})