import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { createHash } from 'crypto';
import { createLogger } from '../utils/logger.js';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic import for WDK (will be installed)
let EvmWallet;
try {
  const require = createRequire(import.meta.url);
  const wdkEvm = require('@tetherto/wdk-evm');
  EvmWallet = wdkEvm.EvmWallet;
} catch (error) {
  createLogger({ service: 'yieldkernel-wallet' }).warn('wdk.unavailable', { reason: 'module_not_installed' });
}

export class WalletManager {
  constructor(config = {}) {
    this.log = createLogger({ service: 'yieldkernel-wallet' });
    this.wdkInstalled = Boolean(EvmWallet);
    this.walletMode = this.wdkInstalled ? 'wdk' : 'ethers';
    this.config = {
      rpcUrl: config.rpcUrl || process.env.RPC_URL || 'https://eth.llamarpc.com',
      chainId: config.chainId || parseInt(process.env.CHAIN_ID || '1'),
      mnemonic: config.mnemonic || process.env.WALLET_MNEMONIC
    };
    this.wallet = null;
  }

  async initialize() {
    try {
      if (!EvmWallet) {
        this.walletMode = 'ethers';
        if (!this.config.mnemonic) {
          throw new Error('WALLET_MNEMONIC is required when WDK is not available.');
        }
        const provider = new ethers.JsonRpcProvider(this.config.rpcUrl, this.config.chainId);
        this.wallet = ethers.Wallet.fromPhrase(this.config.mnemonic).connect(provider);
        const mnemonicFingerprint = createHash('sha256').update(this.config.mnemonic).digest('hex').slice(0, 12);
        const address = await this.wallet.getAddress();
        this.log.warn('wallet.fallback.ethers', { mnemonicFingerprint, address, chainId: this.config.chainId, rpcUrl: this.config.rpcUrl });
        return this.wallet;
      }

      if (!this.config.mnemonic) {
        this.walletMode = 'wdk';
        this.log.info('wallet.generate.start', { chainId: this.config.chainId });
        this.wallet = await EvmWallet.create({
          rpcUrl: this.config.rpcUrl,
          chainId: this.config.chainId
        });

        const mnemonic = this.wallet.getMnemonic();
        const mnemonicFingerprint = createHash('sha256').update(mnemonic).digest('hex').slice(0, 12);
        this.log.warn('wallet.generate.mnemonic_created', { mnemonicFingerprint });

        // Save to .env file
        const envPath = join(__dirname, '..', '.env');
        const envContent = fs.existsSync(envPath)
          ? fs.readFileSync(envPath, 'utf8')
          : '';

        if (!envContent.includes('WALLET_MNEMONIC=')) {
          fs.appendFileSync(envPath, `\nWALLET_MNEMONIC="${mnemonic}"\n`);
          this.log.info('wallet.generate.mnemonic_saved', { envPath });
        }
      } else {
        this.walletMode = 'wdk';
        this.wallet = await EvmWallet.fromMnemonic(this.config.mnemonic, {
          rpcUrl: this.config.rpcUrl,
          chainId: this.config.chainId
        });
        const mnemonicFingerprint = createHash('sha256').update(this.config.mnemonic).digest('hex').slice(0, 12);
        this.log.info('wallet.load.mnemonic', { mnemonicFingerprint, chainId: this.config.chainId });
      }

      const address = await this.wallet.getAddress();
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
      if (!tokenAddress) {
        // Get native ETH balance
        const balance = await this.wallet.getBalance();
        return { balance, symbol: 'ETH' };
      } else {
        // Get ERC-20 token balance
        const balance = await this.wallet.getTokenBalance(tokenAddress);
        return { balance, symbol: 'TOKEN' };
      }
    } catch (error) {
      this.log.error('wallet.balance.error', { error: { name: error?.name, message: error?.message } });
      return { balance: '0', symbol: 'UNKNOWN' };
    }
  }

  async sendTransaction(to, amount, tokenAddress = null) {
    if (!this.wallet) throw new Error('Wallet not initialized');

    this.log.warn('wallet.tx.confirmation_required', { to, amount, tokenAddress: tokenAddress || 'ETH' });

    // In production, implement proper user confirmation
    // For demo, we'll simulate confirmation
    const confirmed = await this.requestConfirmation();

    if (!confirmed) {
      this.log.warn('wallet.tx.cancelled');
      return null;
    }

    try {
      let tx;
      if (!tokenAddress) {
        tx = await this.wallet.sendTransaction({ to, value: amount });
      } else {
        tx = await this.wallet.sendToken(tokenAddress, to, amount);
      }

      this.log.info('wallet.tx.sent', { hash: tx?.hash, to, tokenAddress: tokenAddress || 'ETH' });
      return tx;
    } catch (error) {
      this.log.error('wallet.tx.error', { error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  async requestConfirmation() {
    // Simulate user confirmation - in production, use readline or UI
    return new Promise((resolve) => {
      process.stdin.once('data', () => resolve(true));
      setTimeout(() => resolve(false), 30000); // 30s timeout
    });
  }

  getAddress() {
    return this.wallet ? this.wallet.getAddress() : null;
  }
}
