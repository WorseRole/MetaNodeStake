// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakeLikeFalse {
    function depositETH() external payable;
    function unstake(uint256 pid, uint256 amount) external;
    function withdraw(uint256 pid) external;
}

contract TestEthReceiverFalse {
    function depositToStake(address stake) external payable {
        IStakeLikeFalse(stake).depositETH{value: msg.value}();
    }

    function requestUnstake(address stake, uint256 pid, uint256 amount) external {
        IStakeLikeFalse(stake).unstake(pid, amount);
    }

    function doWithdraw(address stake, uint256 pid) external {
        IStakeLikeFalse(stake).withdraw(pid);
    }

    receive() external payable {
        assembly {
            mstore(0x00, 0)
            return(0x00, 0x20)
        }
    }

    fallback(bytes calldata) external payable returns (bytes memory) {
        return abi.encode(false);
    }
}
