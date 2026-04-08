# MetaNode stake contract

操作流程以及命令

## 拉取项目

```zsh
git clone https://github.com/MetaNodeAcademy/Advanced2-contract-stake/tree/main/stake-contract
```

## 安装依赖

```zsh
npm install
```

## 编译

```
npx hardhat compile
```

**注意!!!!** 

`hardhat` 这个库有个巨坑!!! 他自己生成的文件无论你的 solidity 文件叫什么名字, 编译出来统一叫:

`stake-contract/ignition/modules/Rcc.js`

还要自己将其重命名为 `stake-contract/ignition/modules/MetaNode.js` . 差点没被害死╮(╯_╰)╭ AI也查不出来!!!

所以这步完全可以用 Remix 取代!


## 部署 MetaNode token

```zsh
npx hardhat ignition deploy ./ignition/modules/MetaNode.js
```

部署之后在 terminal 拿到合约地址,比如: `0x264e0349deEeb6e8000D40213Daf18f8b3dF02c3`

## 部署完 MetaNode Token,拿以上地址作为 MetaNodeStake 合约的初始化参数,在 MetaNodeStake 中设置

```js
const MetaNodeToken = "0x264e0349deEeb6e8000D40213Daf18f8b3dF02c3";
```

## 将 stake 合约部署到 sepolia 上

```zsh
npx hardhat run scripts/MetaNodeStake.js --network sepolia
```

## 运行资金池函数 `addPool`:

```zsh
npx hardhat run scripts/addPool.js --network sepolia
```

## 最后得到的覆盖率 

npx hardhat coverage

----------------------------|----------|----------|----------|----------|----------------|
File                        |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
----------------------------|----------|----------|----------|----------|----------------|
 contracts/                 |      100 |    81.72 |    97.83 |      100 |                |
  MetaNode.sol              |      100 |      100 |      100 |      100 |                |
  MetaNodeStake.sol         |      100 |    81.72 |    96.88 |      100 |                |
  TestERC20.sol             |      100 |      100 |      100 |      100 |                |
  TestEthReceiver.sol       |      100 |      100 |      100 |      100 |                |
  TestEthReceiverFalse.sol  |      100 |      100 |      100 |      100 |                |
  TestEthReceiverRevert.sol |      100 |      100 |      100 |      100 |                |
----------------------------|----------|----------|----------|----------|----------------|
All files                   |      100 |    81.72 |    97.83 |      100 |                |
----------------------------|----------|----------|----------|----------|----------------|

