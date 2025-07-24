import { ethers } from "hardhat";

export function encodeProxyCall (parametersType: string[], values: any[]) {
    const iface = new ethers.Interface([`function initialize(${parametersType.join(',')})`]);
    return iface.encodeFunctionData("initialize", values);
}

export function encodeModuleCall (parametersType: string[], values: any[]) {
    const iface = new ethers.Interface([`function configure(${parametersType.join(',')})`]);
    return iface.encodeFunctionData("configure", values);
}

export function encodeCall (methodName: string, parametersType: string[], values: any[]) {
    const iface = new ethers.Interface([`function ${methodName}(${parametersType.join(',')})`]);
    return iface.encodeFunctionData(methodName, values);
}


