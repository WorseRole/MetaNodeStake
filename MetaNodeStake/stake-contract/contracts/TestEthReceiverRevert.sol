// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakeLikeRevert {
    function depositETH() external payable;
    function unstake(uint256 pid, uint256 amount) external;
    function withdraw(uint256 pid) external;
}

contract TestEthReceiverRevert {
    function depositToStake(address stake) external payable {
        IStakeLikeRevert(stake).depositETH{value: msg.value}();
    }

    function requestUnstake(address stake, uint256 pid, uint256 amount) external {
        IStakeLikeRevert(stake).unstake(pid, amount);
    }

    function doWithdraw(address stake, uint256 pid) external {
        IStakeLikeRevert(stake).withdraw(pid);
    }

    receive() external payable {
        revert("receiver revert");
    }

    fallback(bytes calldata) external payable returns (bytes memory) {
        revert("receiver revert");
    }
}
