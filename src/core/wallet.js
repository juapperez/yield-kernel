import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { createHash } from 'crypto';
import { createLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic import for WDK
let WalletManagerEvm;
let WalletAccountEvm;
try {
  const require = createRequire(import.meta.url);
  const wdk = require('@tetherto/wdk-wallet-evm');
  WalletManagerEvm = wdk.default || wdk.WalletManagerEvm;
  WalletAccountEvm = wdk.WalletAccountEvm;
} catch (error) {
  createLogger({ service: 'yieldkernel-wallet' }).warn('wdk.unavailable', { reason: 'module_not_installed' });
}

export class WalletManager {
  constructor(config = {}) {
    this.log = createLogger({ service: 'yieldkernel-wallet' });
    this.wdkInstalled = Boolean(WalletManagerEvm);
    this.walletMode = this.wdkInstalled ? 'wdk' : 'unavailable';
    this.config = {
      rpcUrl: config.rpcUrl || process.env.RPC_URL || 'https://eth.llamarpc.com',
      chainId: config.chainId || parseInt(process.env.CHAIN_ID || '1'),
      mnemonic: config.mnemonic || process.env.WALLET_MNEMONIC,
      persistGeneratedMnemonic: Boolean(config.persistGeneratedMnemonic ?? (String(process.env.ALLOW_WRITE_MNEMONIC || '').toLowerCase() === 'true'))
    };
    this.wallet = null;
  }

  async initialize() {
    try {
      if (!WalletManagerEvm) {
        throw new Error('WDK not available');
      }

      if (!this.config.mnemonic) {
        this.walletMode = 'wdk';
        this.log.info('wallet.generate.start', { chainId: this.config.chainId });
        this.wallet = new WalletManagerEvm(undefined, {
          provider: this.config.rpcUrl,
          chainId: this.config.chainId
        });

        const mnemonic = this.wallet.getMnemonic?.() || 'generated';
        const mnemonicFingerprint = createHash('sha256').update(mnemonic).digest('hex').slice(0, 12);
        this.log.warn('wallet.generate.mnemonic_created', { mnemonicFingerprint });

        if (this.config.persistGeneratedMnemonic) {
          const envPath = join(__dirname, '..', '..', '.env');
          const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
          if (!envContent.includes('WALLET_MNEMONIC=')) {
            fs.appendFileSync(envPath, `\nWALLET_MNEMONIC="${mnemonic}"\n`);
            this.log.info('wallet.generate.mnemonic_saved', { envPath });
          }
        }
      } else {
        this.walletMode = 'wdk';
        this.wallet = new WalletManagerEvm(this.config.mnemonic, {
          provider: this.config.rpcUrl,
          chainId: this.config.chainId
        });
        const mnemonicFingerprint = createHash('sha256').update(this.config.mnemonic).digest('hex').slice(0, 12);
        this.log.info('wallet.load.mnemonic', { mnemonicFingerprint, chainId: this.config.chainId });
      }

      const address = await this.wallet.getAddress?.() || 'unknown';
      this.log.info('wallet.ready', { address, chainId: this.config.chainId, rpcUrl: this.config.rpcUrl });

      return this.wallet;
    } catch (error) {
      this.log.error('wallet.init.error', { error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  getRuntimeStatus() {
    return {
      wdkInstalled: this.wdkInstalled,
      walletMode: this.walletMode,
      chainId: this.config.chainId,
      rpcUrl: this.config.rpcUrl
    };
  }

  async getBalance(tokenAddress = null) {
    if (!this.wallet) throw new Error('Wallet not initialized');

    try {
      const account = await this.wallet.getAccount(0);
      
      if (!tokenAddress) {
        // Get native ETH balance
        const balance = await account.getNativeBalance();
        return { balance: balance.toString(), symbol: 'ETH' };
      }
      
      // Get ERC-20 token balance using WDK
      const balance = await account.getTokenBalance(tokenAddress);
      return { balance: balance.toString(), symbol: 'TOKEN' };
    } catch (error) {
      this.log.error('wallet.balance.error', { error: { name: error?.name, message: error?.message } });
      return { balance: '0', symbol: 'UNKNOWN' };
    }
  }

  async sendTransaction(to, amount, tokenAddress = null) {
    if (!this.wallet) throw new Error('Wallet not initialized');

    try {
      const account = await this.wallet.getAccount(0);
      let tx;
      
      if (!tokenAddress) {
        // Send native ETH using WDK
        tx = await account.sendTransaction({ to, value: BigInt(amount) });
      } else {
        // Send ERC-20 token using WDK
        tx = await account.transfer(tokenAddress, to, BigInt(amount));
      }

      this.log.info('wallet.tx.sent', { hash: tx?.hash, to, tokenAddress: tokenAddress || 'ETH' });
      return tx;
    } catch (error) {
      this.log.error('wallet.tx.error', { error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  getAddress() {
    return this.wallet ? this.wallet.getAddress?.() : null;
  }
}
