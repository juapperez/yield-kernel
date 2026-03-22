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
    this.walletMode = this.wdkInstalled ? 'wdk' : 'unavailable';
    this.config = {
      rpcUrl: config.rpcUrl || process.env.RPC_URL || 'https://eth.llamarpc.com',
      chainId: config.chainId || parseInt(process.env.CHAIN_ID || '1'),
      mnemonic: config.mnemonic || process.env.WALLET_MNEMONIC,
      allowEthersFallback: Boolean(config.allowEthersFallback ?? (String(process.env.ALLOW_ETHERS_FALLBACK || '').toLowerCase() === 'true')),
      persistGeneratedMnemonic: Boolean(config.persistGeneratedMnemonic ?? (String(process.env.ALLOW_WRITE_MNEMONIC || '').toLowerCase() === 'true'))
    };
    this.wallet = null;
  }

  async initialize() {
    try {
      if (!EvmWallet) {
        if (!this.config.allowEthersFallback) {
          throw new Error('WDK is required. Install @tetherto/wdk-evm or set ALLOW_ETHERS_FALLBACK=true (not recommended for judging).');
        }
        
        // If no mnemonic, generate one
        if (!this.config.mnemonic) {
          this.walletMode = 'ethers-generated';
          const randomWallet = ethers.Wallet.createRandom();
          this.config.mnemonic = randomWallet.mnemonic.phrase;
          this.log.info('wallet.generate.random', { address: randomWallet.address });
        }
        
        this.walletMode = 'ethers';
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

        if (this.config.persistGeneratedMnemonic) {
          const envPath = join(__dirname, '...', '..', '.env');
          const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
          if (!envContent.includes('WALLET_MNEMONIC=')) {
            fs.appendFileSync(envPath, `\nWALLET_MNEMONIC="${mnemonic}"\n`);
            this.log.info('wallet.generate.mnemonic_saved', { envPath });
          }
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
        const address = await this.wallet.getAddress();
        const provider = this.wallet?.provider || new ethers.JsonRpcProvider(this.config.rpcUrl, this.config.chainId);
        const balance = await provider.getBalance(address);
        return { balance: balance.toString(), symbol: 'ETH' };
      }
      if (typeof this.wallet.getTokenBalance === 'function') {
        const balance = await this.wallet.getTokenBalance(tokenAddress);
        return { balance: String(balance), symbol: 'TOKEN' };
      }
      const provider = this.wallet?.provider || new ethers.JsonRpcProvider(this.config.rpcUrl, this.config.chainId);
      const address = await this.wallet.getAddress();
      const erc20 = new ethers.Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'], provider);
      const [balance, symbol] = await Promise.all([erc20.balanceOf(address), erc20.symbol().catch(() => 'TOKEN')]);
      return { balance: balance.toString(), symbol };
    } catch (error) {
      this.log.error('wallet.balance.error', { error: { name: error?.name, message: error?.message } });
      return { balance: '0', symbol: 'UNKNOWN' };
    }
  }

  async sendTransaction(to, amount, tokenAddress = null) {
    if (!this.wallet) throw new Error('Wallet not initialized');

    try {
      let tx;
      if (!tokenAddress) {
        tx = await this.wallet.sendTransaction({ to, value: amount });
      } else {
        if (typeof this.wallet.sendToken === 'function') {
          tx = await this.wallet.sendToken(tokenAddress, to, amount);
        } else {
          const signer = typeof this.wallet.getSigner === 'function' ? await this.wallet.getSigner() : this.wallet;
          const erc20 = new ethers.Contract(tokenAddress, ['function transfer(address to, uint256 amount) returns (bool)'], signer);
          tx = await erc20.transfer(to, amount);
        }
      }

      this.log.info('wallet.tx.sent', { hash: tx?.hash, to, tokenAddress: tokenAddress || 'ETH' });
      return tx;
    } catch (error) {
      this.log.error('wallet.tx.error', { error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  getAddress() {
    return this.wallet ? this.wallet.getAddress() : null;
  }
}
