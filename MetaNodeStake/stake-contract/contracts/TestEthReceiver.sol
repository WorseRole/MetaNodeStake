// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakeLike {
    function depositETH() external payable;
    function unstake(uint256 pid, uint256 amount) external;
    function withdraw(uint256 pid) external;
}

contract TestEthReceiver {
    function depositToStake(address stake) external payable {
        IStakeLike(stake).depositETH{value: msg.value}();
    }

    function requestUnstake(address stake, uint256 pid, uint256 amount) external {
        IStakeLike(stake).unstake(pid, amount);
    }

    function doWithdraw(address stake, uint256 pid) external {
        IStakeLike(stake).withdraw(pid);
    }

    receive() external payable {
        assembly {
            mstore(0x00, 1)
            return(0x00, 0x20)
        }
    }

    fallback(bytes calldata) external payable returns (bytes memory) {
        return abi.encode(true);
    }
}
