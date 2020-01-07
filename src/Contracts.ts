import IConfig from './IConfig';
import { DavID, BigInteger, ID, ContractsArtifacts } from './common-types';
import Web3 = require('web3');
import { ContractTypes } from './common-enums';
import Contract from 'web3/eth/contract';
import { EventLog, TransactionReceipt } from 'web3/types';
import { Observable } from 'rxjs';
import IPrice from './IPrice';
import sdkLogger from './sdkLogger';

let contracts: ContractsArtifacts = {
  Identity: require('./contracts/Identity'),
  DAVToken: require('./contracts/DAVToken'),
  BasicMission: require('./contracts/BasicMission'),
};

const REGISTRATION_REQUEST_HASH = new Web3().utils.sha3(
  'DAV Identity Registration',
);
const TOKEN_AMOUNT = '1500000000000'; // TODO: TOKEN_AMOUNT need to be set by basicMission contract.

interface IContract {
  contract: Contract;
  contractAddress: string;
  abi: any[];
}

export default class Contracts {
  private static initWeb3(config: IConfig): Web3 {
    return new Web3(new Web3.providers.HttpProvider(config.ethNodeUrl));
  }

  private static getContract(
    contractType: ContractTypes,
    web3: Web3,
    config: IConfig,
  ): IContract {
    if (config.contracts) {
      contracts = config.contracts;
    }
    const abi = contracts[contractType].abi;
    const contractAddress =
      contracts[contractType].networks[config.blockchainType].address;
    const contract = new web3.eth.Contract(abi, contractAddress);
    return { abi, contractAddress, contract };
  }

  private static sendSignedTransaction(
    web3: Web3,
    rawTransaction: string,
  ): Promise<TransactionReceipt> {
    return new Promise((resolve, reject) => {
      const transaction = web3.eth.sendSignedTransaction(rawTransaction);
      transaction.once('receipt', receipt => {
        sdkLogger(`Web3 transaction succeeded: ${JSON.stringify(receipt)}`);
        resolve(receipt);
      });
      transaction.once('transactionHash', hash => {
        sdkLogger(`Web3 transaction sent: ${hash}`);
      });
      transaction.on('error', err => {
        sdkLogger(`Web3 transaction failed: ${JSON.stringify(err)}`);
        reject(err);
      });
    });
  }

  private static async checkContractPastEvents(
    contract: Contract /* , filterParam: string */,
  ): Promise<EventLog[]> {
    // TODO: Filter getPastEvents by sellerId or by missionId.
    const event = await contract.getPastEvents('allEvents');
    return event;
  }

  private static toSafeGasLimit(gasAmount: number) {
    return Math.min(gasAmount + 100, 4000000);
  }

  private static calculatePrice(price: IPrice | BigInteger | Array<IPrice | BigInteger>): BigInteger {
    if (Array.isArray(price)) {
      price = (price as any[])[0];
    }
    return (price as IPrice).value || (price as BigInteger);
  }

  public static generateMissionId(config: IConfig): string {
    const web3 = Contracts.initWeb3(config);
    const { address } = web3.eth.accounts.create();
    return address;
  }

  public static async isIdentityRegistered(
    davId: DavID,
    config: IConfig,
  ): Promise<boolean> {
    const web3 = Contracts.initWeb3(config);
    const { contract } = Contracts.getContract(
      ContractTypes.identity,
      web3,
      config,
    );
    const receipt = await contract.methods.isRegistered(davId).call();
    return receipt;
  }

  public static async registerIdentity(
    davId: DavID,
    identityPrivateKey: string,
    walletAddress: string,
    walletPrivateKey: string,
    config: IConfig,
  ): Promise<string> {
    const isAlreadyRegistered = await Contracts.isIdentityRegistered(
      davId,
      config,
    );
    if (isAlreadyRegistered) {
      return 'ALREADY_REGISTERED';
    }
    const web3 = Contracts.initWeb3(config);
    const { contract, contractAddress } = Contracts.getContract(
      ContractTypes.identity,
      web3,
      config,
    );
    const { sign } = web3.eth.accounts.privateKeyToAccount(identityPrivateKey);
    const { v, r, s } = sign(REGISTRATION_REQUEST_HASH);
    const { encodeABI, estimateGas } = await contract.methods.register(
      davId,
      v,
      r,
      s,
    );
    const encodedABI = encodeABI();
    const estimatedGas = await estimateGas({ from: walletAddress });
    const safeGasLimit = Contracts.toSafeGasLimit(estimatedGas);
    const gasPrice = await web3.eth.getGasPrice();
    const tx = {
      data: encodedABI,
      to: contractAddress,
      from: walletAddress,
      gas: safeGasLimit,
      gasPrice,
    };
    const { rawTransaction } = await web3.eth.accounts.signTransaction(
      tx,
      walletPrivateKey,
    );
    const transactionReceipt = await Contracts.sendSignedTransaction(
      web3,
      rawTransaction,
    );
    return transactionReceipt.transactionHash;
  }

  public static async approveMission(
    davId: DavID,
    walletPrivateKey: string,
    config: IConfig,
  ): Promise<TransactionReceipt> {
    const web3 = Contracts.initWeb3(config);
    const { contract, contractAddress } = Contracts.getContract(
      ContractTypes.davToken,
      web3,
      config,
    );
    const missionContract = Contracts.getContract(
      ContractTypes.basicMission,
      web3,
      config,
    );
    const { encodeABI, estimateGas } = await contract.methods.approve(
      missionContract.contractAddress,
      TOKEN_AMOUNT,
    );
    const encodedABI = encodeABI();
    const estimatedGas = await estimateGas({ from: davId, to: contractAddress });
    const safeGasLimit = Contracts.toSafeGasLimit(estimatedGas);
    const gasPrice = await web3.eth.getGasPrice();
    const tx = {
      data: encodedABI,
      to: contractAddress,
      from: davId,
      gas: safeGasLimit,
      gasPrice,
    };
    const { rawTransaction } = await web3.eth.accounts.signTransaction(
      tx,
      walletPrivateKey,
    );
    const transactionReceipt = await Contracts.sendSignedTransaction(
      web3,
      rawTransaction,
    );
    return transactionReceipt;
  }

  public static async startMission(
    missionId: ID,
    davId: DavID,
    walletPublicKey: string,
    walletPrivateKey: string,
    vehicleId: DavID,
    config: IConfig,
  ): Promise<TransactionReceipt> {
    const web3 = Contracts.initWeb3(config);
    const { contract, contractAddress } = Contracts.getContract(
      ContractTypes.basicMission,
      web3,
      config,
    );

    // Get nonce (count) of user tx
    const nonce = await web3.eth.getTransactionCount(walletPublicKey);

    const { encodeABI, estimateGas } = await contract.methods.create(
      missionId,
      vehicleId,
      davId,
      TOKEN_AMOUNT,
    );
    const encodedABI = encodeABI();
    const gasPrice = await web3.eth.getGasPrice();
    const estimatedGas = await estimateGas({
      from: walletPublicKey,
      to: contractAddress,
    });

    const safeGasLimit = Contracts.toSafeGasLimit(estimatedGas);
    const tx = {
      nonce: web3.utils.toHex(nonce),
      data: encodedABI,
      to: contractAddress,
      from: walletPublicKey,
      gas: web3.utils.toHex(safeGasLimit),
      gasPrice: web3.utils.toHex(gasPrice),
    };
    const { rawTransaction } = await
      web3.eth.accounts.signTransaction(
        tx,
        walletPrivateKey,
      );
    const transactionReceipt = await
      Contracts.sendSignedTransaction(
        web3,
        rawTransaction,
      );
    return transactionReceipt;
  }

  public static async finalizeMission(
    missionId: ID,
    davId: DavID,
    walletPublicKey: string,
    walletPrivateKey: string,
    config: IConfig,
  ): Promise<TransactionReceipt> {
    const web3 = Contracts.initWeb3(config);
    const { contract, contractAddress } = Contracts.getContract(
      ContractTypes.basicMission,
      web3,
      config,
    );
    const { encodeABI, estimateGas } = await contract.methods.fulfilled(
      missionId,
    );
    const encodedABI = encodeABI();
    const estimatedGas = await estimateGas({
      from: walletPublicKey,
      to: contractAddress,
    });
    const safeGasLimit = Contracts.toSafeGasLimit(estimatedGas);
    const gasPrice = await web3.eth.getGasPrice();
    const tx = {
      data: encodedABI,
      to: contractAddress,
      from: davId,
      gas: safeGasLimit,
      gasPrice,
    };
    const { rawTransaction } = await web3.eth.accounts.signTransaction(
      tx,
      walletPrivateKey,
    );
    const transactionReceipt = await Contracts.sendSignedTransaction(
      web3,
      rawTransaction,
    );
    return transactionReceipt;
  }

  public static watchContract(
    davId: string,
    contractType: ContractTypes,
    config: IConfig,
  ): Observable<EventLog> {
    const web3 = Contracts.initWeb3(config);
    const { contract } = Contracts.getContract(contractType, web3, config);
    let lastBlock = 0;
    let lastTransactionIndex = 0;
    const events = Observable.interval(2000)
      .map(() => Contracts.checkContractPastEvents(contract /* , davId */))
      .map(promise => Observable.fromPromise(promise))
      .map(eventsObservable => eventsObservable.mergeAll())
      .map(eventsArray => Observable.from(eventsArray))
      .mergeAll()
      .filter(
        event =>
          event.blockNumber > lastBlock ||
          (event.blockNumber === lastBlock &&
            event.transactionIndex > lastTransactionIndex),
      )
      .do(event => {
        lastBlock = event.blockNumber;
        lastTransactionIndex = event.transactionIndex;
      });
    return events;
  }
}
