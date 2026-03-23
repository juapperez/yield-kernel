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

    // Defensive loading of mnemonic from various sources
    let m = (config.mnemonic || process.env.WALLET_MNEMONIC || '').trim();

    // Remove literal quotes if present (common in env files)
    if ((m.startsWith('"') && m.endsWith('"')) || (m.startsWith("'") && m.endsWith("'"))) {
      m = m.slice(1, -1).trim();
    }

    // Filter out common "placeholder" strings from environment loaders
    const invalidPlaceholders = ['undefined', 'null', 'false', '0', '[REDACTED]', 'YOUR_MNEMONIC_HERE'];
    if (invalidPlaceholders.includes(m.toLowerCase()) || m === '') {
      m = null;
    }

    this.config = {
      rpcUrl: config.rpcUrl || process.env.RPC_URL || 'https://eth.llamarpc.com',
      chainId: config.chainId || parseInt(process.env.CHAIN_ID || '1'),
      mnemonic: m,
      persistGeneratedMnemonic: Boolean(config.persistGeneratedMnemonic ?? (String(process.env.ALLOW_WRITE_MNEMONIC || '').toLowerCase() === 'true'))
    };
    this.wallet = null;
  }

  async initialize() {
    try {
      if (!WalletManagerEvm) {
        throw new Error('WDK not available');
      }

      // Check if the provided mnemonic is actually valid
      let mnemonicToUse = this.config.mnemonic;
      if (mnemonicToUse) {
        const words = mnemonicToUse.trim().split(/\s+/);
        if (words.length < 12) {
          this.log.warn('wallet.init.invalid_mnemonic', {
            reason: 'too_short',
            wordCount: words.length,
            message: 'Mnemonic must be 12 or 24 words. Falling back to generation.'
          });
          mnemonicToUse = null;
        }
      }

      if (!mnemonicToUse) {
        this.walletMode = 'wdk';
        this.log.info('wallet.generate.start', { chainId: this.config.chainId });

        // Pass undefined to WalletManagerEvm to trigger internal generation
        this.wallet = new WalletManagerEvm(undefined, {
          provider: this.config.rpcUrl,
          chainId: this.config.chainId
        });

        // Try to retrieve the generated mnemonic to save it if allowed
        try {
          const generatedMnemonic = await this.wallet.getMnemonic?.();

          if (generatedMnemonic && this.config.persistGeneratedMnemonic) {
            this.config.mnemonic = generatedMnemonic;
            const envPath = join(__dirname, '..', '..', '.env');
            if (fs.existsSync(envPath)) {
              let envContent = fs.readFileSync(envPath, 'utf8');
              if (envContent.includes('WALLET_MNEMONIC=')) {
                envContent = envContent.replace(/WALLET_MNEMONIC=.*/, `WALLET_MNEMONIC="${generatedMnemonic}"`);
              } else {
                envContent += `\nWALLET_MNEMONIC="${generatedMnemonic}"\n`;
              }
              fs.writeFileSync(envPath, envContent);
              this.log.info('wallet.generate.mnemonic_saved', { envPath });
            }
          }
        } catch (e) {
          this.log.warn('wallet.generate.save_skipped', { reason: e.message });
        }
      } else {
        this.walletMode = 'wdk';
        const words = mnemonicToUse.split(/\s+/);
        this.log.info('wallet.init.mnemonic_info', {
          wordCount: words.length,
          firstWord: words[0],
          lastWord: words[words.length - 1],
          length: mnemonicToUse.length
        });

        try {
          this.wallet = new WalletManagerEvm(mnemonicToUse, {
            provider: this.config.rpcUrl,
            chainId: this.config.chainId
          });

          const mnemonicFingerprint = createHash('sha256').update(mnemonicToUse).digest('hex').slice(0, 12);
          this.log.info('wallet.load.mnemonic', { mnemonicFingerprint, chainId: this.config.chainId });
        } catch (e) {
          this.log.warn('wallet.init.provided_mnemonic_failed', {
            error: e.message,
            message: 'Provided mnemonic failed validation (likely checksum or wordlist). Falling back to generation.'
          });

          // Fallback to generation if provided mnemonic fails
          this.wallet = new WalletManagerEvm(undefined, {
            provider: this.config.rpcUrl,
            chainId: this.config.chainId
          });
          this.walletMode = 'wdk.generated_fallback';
        }
      }

      const address = await this.wallet.getAddress?.() || 'unknown';
      this.log.info('wallet.ready', { address, chainId: this.config.chainId, rpcUrl: this.config.rpcUrl });

      return this.wallet;
    } catch (error) {
      this.log.error('wallet.init.error', { error: { name: error?.name, message: error?.message, stack: error?.stack } });
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
