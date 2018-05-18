const ProviderEngine = require('web3-provider-engine');
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc.js');
const async = require('async');
const AccountParser = require('./accountParser');
const fundAccount = require('./fundAccount');

const NO_ACCOUNTS = 'noAccounts';

class Provider {
  constructor(options) {
    this.web3 = options.web3;
    this.accountsConfig = options.accountsConfig;
    this.web3Endpoint = options.web3Endpoint;
    this.logger = options.logger;
    this.isDev = options.isDev;
    this.engine = new ProviderEngine();
    this.asyncMethods = {};
  }

  startProvider(callback) {
    const self = this;
    self.engine.addProvider(new RpcSubprovider({
      rpcUrl: self.web3Endpoint
    }));

    // network connectivity error
    self.engine.on('error', (err) => {
      // report connectivity errors
      self.logger.error(err.stack);
    });

    self.engine.start();
    self.web3.setProvider(self);

    self.accounts = AccountParser.parseAccountsConfig(self.accountsConfig, self.web3, self.logger);
    self.addresses = [];
    async.waterfall([
      function fundAccounts(next) {
        if (!self.accounts.length) {
          return next(NO_ACCOUNTS);
        }
        if (!self.isDev) {
          return next();
        }
        async.each(self.accounts, (account, eachCb) => {
          fundAccount(self.web3, account.address, eachCb);
        }, next);
      },
      function populateWeb3Wallet(next) {
        self.accounts.forEach(account => {
          self.addresses.push(account.address);
          self.web3.eth.accounts.wallet.add(account);
        });
        self.asyncMethods = {
          eth_accounts: self.eth_accounts.bind(self)
        };
        next();
      }
    ], function (err) {
      if (err && err !== NO_ACCOUNTS) {
        self.logger.error((err));
      }
      callback();
    });
  }

  eth_accounts(payload, cb) {
    return cb(null, this.addresses);
  }

  sendAsync(payload, callback) {
    let method = this.asyncMethods[payload.method];
    if (method) {
      return method.call(method, payload, (err, result) => {
        if (err) {
          return callback(err);
        }
        let response = {'id': payload.id, 'jsonrpc': '2.0', 'result': result};
        callback(null, response);
      });
    }
    this.engine.sendAsync.apply(this.engine, arguments);
  }

  send() {
    return this.engine.send.apply(this.engine, arguments);
  }
}

module.exports = Provider;
