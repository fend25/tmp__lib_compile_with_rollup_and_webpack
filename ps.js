/**
 * Unique crowdloan script to be included in the browser
 *
 * Compiling:
 *   npm install -g browserify
 *   browserify ps.js > ../ps.js
 */

const { ApiPromise, WsProvider } = require('@polkadot/api');
const { web3Accounts, web3Enable, web3FromAddress } = require('@polkadot/extension-dapp');
const { stringToHex, u8aToHex, hexToU8a, isHex } = require('@polkadot/util');
const { decodeAddress, encodeAddress } = require('@polkadot/keyring');

var BigNumber = require('bignumber.js');
BigNumber.config({ DECIMAL_PLACES: 12, ROUNDING_MODE: BigNumber.ROUND_DOWN, decimalSeparator: '.' });

class CrowdLoan {

  constructor(wsEndpointRelay) {
    this.wsEndpointRelay = wsEndpointRelay;
  }

  async disconnectRelay() {
    if (this.relayApi) {
      try {
        this.relayApi.disconnect();
      } catch (e) {}
      this.relayApi = null;
    }
  }

  async connectRelay() {
    if (!this.relayApi) {
      // Initialise the provider to connect to the node
      console.log(`Connecting to ${this.wsEndpointRelay}`);
      const wsProvider = new WsProvider(this.wsEndpointRelay);

      // Create the API and wait until ready
      const api = await ApiPromise.create({ provider: wsProvider });
      this.relayApi = api;

      // Read token decimals
      const properties = await api.rpc.system.properties();
      if (properties.tokenDecimals)
        this.relayDecimals = properties.tokenDecimals.toHuman()[0];
      else {
        this.relayDecimals = 12;
        console.log(`WARNING, tokenDecimals is not found is system properties. Will be set to a hardcode of ${this.relayDecimals}`);
      }
    }
  }

  async getRaisedAmount(paraId) {
    const fund = (await this.relayApi.query.crowdloan.funds(paraId)).toJSON();
    if (fund) {
      return (new BigNumber(fund.raised)).dividedBy(1e10);
    }
    else return new BigNumber(0);
  }

  async checkExtension() {
    await web3Enable('uniquecrowdloan');
    const allAccounts = await web3Accounts({ ss58Format: 0 });

    if (allAccounts.length == 0) return false;
    else return true;
  }

  async getWalletAddresses() {
    return await web3Accounts({ ss58Format: 0 });
  }

  getTransactionStatus(events, status) {
    if (status.isReady) {
      return "NotReady";
    }
    if (status.isBroadcast) {
      return "NotReady";
    }
    if (status.isInBlock || status.isFinalized) {
      if(events.filter(e => e.event.data.method === 'ExtrinsicFailed').length > 0) {
        return "Fail";
      }
      if(events.filter(e => e.event.data.method === 'ExtrinsicSuccess').length > 0) {
        return "Success";
      }
    }

    return "Fail";
  }

  sendTransactionAsync(api, sender, transaction) {
    return new Promise(async (resolve, reject) => {
      try {
        const injector = await web3FromAddress(sender);
        api.setSigner(injector.signer);

        let unsub = await transaction.signAndSend(sender, ({ events = [], status }) => {
          const transactionStatus = this.getTransactionStatus(events, status);

          if (transactionStatus === "Success") {
            console.log(`Transaction successful`);
            resolve(events);
            unsub();
          } else if (transactionStatus === "Fail") {
            console.log(`Something went wrong with transaction. Status: ${status}`);
            reject(events);
            unsub();
          }
        });
      } catch (e) {
        console.log('Error: ' + e.toString(), "ERROR");
        reject(e);
      }
    });
  }

  bnToFixed(amount, decimals) {
    const ksmexp = BigNumber(10).pow(decimals);
    const balance = new BigNumber(amount);
    return balance.div(ksmexp).toFixed();
  }

  async getRelayBalance(addr) {
    const api = this.relayApi;
    const acc = await api.query.system.account(addr);
    return this.bnToFixed(acc.data.free, this.relayDecimals);
  }

  async contribute(sender, paraId, amountRl) {
    const exp = (new BigNumber(10)).exponentiatedBy(this.relayDecimals);

    const amount = (new BigNumber(amountRl)).times(exp).integerValue();
    // console.log(`${sender} is contributing ${amount.toString()} for ${paraId}`);

    const tx = this.relayApi.tx.crowdloan.contribute(paraId, amount.toString(), null);
    await this.sendTransactionAsync(this.relayApi, sender, tx);
  }

  async contributeWithRefCode(sender, paraId, amountRl, refCode) {
    const exp = (new BigNumber(10)).exponentiatedBy(this.relayDecimals);

    const amount = (new BigNumber(amountRl)).times(exp).integerValue();
    console.log(`${sender} is contributing ${amount.toString()} for ${paraId} with refCode ${refCode}`);

    if (!refCode || refCode.length == 0 || refCode.length > 100) {
      await this.contribute(sender, paraId, amountRl);
      return;
    }

    const txContribute = this.relayApi.tx.crowdloan.contribute(paraId, amount.toString(), null);
    let bytes = [];
    for (let i = 0; i < refCode.length; ++i) {
      const code = refCode.charCodeAt(i);
      bytes = bytes.concat([code]);
    }

    const txRemark = this.relayApi.tx.system.remark(bytes);
    const tx = this.relayApi.tx.utility.batchAll([txContribute, txRemark]);
    await this.sendTransactionAsync(this.relayApi, sender, tx);
  }

  async transfer(sender, recipient, amountRl) {
    const exp = (new BigNumber(10)).exponentiatedBy(this.relayDecimals);
    const amount = (new BigNumber(amountRl)).times(exp).integerValue();
    console.log(`${sender} is transferring ${amount.toString()} to ${recipient}`);

    const tx = this.relayApi.tx.balances.transfer(recipient, amount);
    await this.sendTransactionAsync(this.relayApi, sender, tx);
  }

  async bifrostContribute(sender, paraId, firstSlot, lastSlot) {
    console.log(`${sender} is contributing for ${paraId} through BiFrost, firstSlot = ${firstSlot}, lastSlot = ${lastSlot}`);
    const tx = this.relayApi.tx.salpLite.contributeFund(paraId, firstSlot, lastSlot);
    await this.sendTransactionAsync(this.relayApi, sender, tx);
  }

  isValidAddress(address) {
    try {
      encodeAddress(
        isHex(address)
          ? hexToU8a(address)
          : decodeAddress(address)
      );

      return true;
    } catch (error) {
      return false;
    }
  }

}

window.CrowdLoan = CrowdLoan;