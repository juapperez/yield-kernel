import dotenv from 'dotenv';

dotenv.config();

import { WalletManager } from './wallet.js';
import { DeFiManager } from './defi.js';
import { RiskManager } from './risk.js';
import { PortfolioMonitor } from '../services/monitor.js';
import { AIProvider } from './ai-provider.js';
import { createLogger } from '../utils/logger.js';

export class DeFiAgent {
  constructor() {
    this.log = createLogger({ service: 'yieldkernel-agent' });
    this.aiProvider = new AIProvider();
    this.walletManager = null;
    this.defiManager = null;
    this.riskManager = null;
    this.monitor = null;
    this.conversationHistory = [];
  }

  async initialize() {
    this.log.info('agent.initialize.start');

    await this.aiProvider.initialize();

    this.walletManager = new WalletManager();
    await this.walletManager.initialize();

    this.defiManager = new DeFiManager(this.walletManager.wallet);
    await this.defiManager.initialize();

    this.riskManager = new RiskManager();

    this.monitor = new PortfolioMonitor(this.defiManager, this.riskManager);

    this.log.info('agent.initialize.ready', { walletReady: Boolean(this.walletManager?.wallet) });
  }

  async chat(userMessage) {
    this.log.info('chat.user', { bytes: String(userMessage || '').length });

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    try {
      // Get agent response
      const message = await this.aiProvider.chat([
        {
          role: 'system',
          content: this.getSystemPrompt()
        },
        ...this.conversationHistory
      ], this.getFunctionDefinitions());

      // Handle function calls
      const fnCall = message.function_call || (message.tool_calls && message.tool_calls.length > 0 ? message.tool_calls[0].function : null);

      if (fnCall) {
        this.log.info('chat.tool_call', { name: fnCall.name });
        const result = await this.executeFunction(
          fnCall.name,
          JSON.parse(fnCall.arguments || '{}')
        );

        // Add function result to history
        this.conversationHistory.push({
          role: 'function',
          name: fnCall.name,
          content: JSON.stringify(result)
        });

        // Get final response
        const finalMessageObj = await this.aiProvider.chat([
          { role: 'system', content: this.getSystemPrompt() },
          ...this.conversationHistory
        ]);

        const finalMessage = finalMessageObj.content;
        this.conversationHistory.push({
          role: 'assistant',
          content: finalMessage
        });

        this.log.info('chat.assistant', { bytes: String(finalMessage || '').length, tool: fnCall.name });
        return finalMessage;
      } else {
        // Regular text response
        this.conversationHistory.push({
          role: 'assistant',
          content: message.content
        });

        this.log.info('chat.assistant', { bytes: String(message.content || '').length });
        return message.content;
      }
    } catch (error) {
      this.log.error('chat.error', { 
        error: { 
          name: error?.name, 
          message: error?.message,
          stack: error?.stack 
        } 
      });
      throw error; // Re-throw so server can see the actual error
    }
  }

  getSystemPrompt() {
    return `You are YieldKernel, an autonomous DeFi portfolio management agent.

CAPABILITIES:
- Self-custodial wallet management
- Aave V3 protocol integration on Ethereum
- Risk assessment and yield optimization
- Autonomous portfolio monitoring

YOUR ROLE:
When a user requests an action, you MUST use the available functions to execute it.
Do not just describe what you would do - actually call the functions.

AVAILABLE FUNCTIONS:
- get_portfolio: View current positions
- get_yields: Fetch yield opportunities
- assess_risk: Score risk (0-100)
- supply_asset: Supply to lending protocol (requires: asset, amount, protocol)
- start_monitoring: Start autonomous monitoring

SAFETY RULES:
- Max position: ${process.env.MAX_POSITION_SIZE_USDT || 1000} USDT
- Min APY: ${process.env.MIN_APY_THRESHOLD || 3.0}%
- Always check gas costs
- Require explicit user authorization

WHEN USER AUTHORIZES A TRANSACTION:
1. Call get_yields to check opportunities
2. Call assess_risk to verify safety
3. If safe, IMMEDIATELY call supply_asset with the exact parameters
4. Return the transaction result

Be direct and action-oriented. Execute functions when requested.`;
  }

  getFunctionDefinitions() {
    return [
      {
        name: 'get_portfolio',
        description: 'Get current portfolio positions and balances',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'get_yields',
        description: 'Get available yield opportunities across DeFi protocols',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'assess_risk',
        description: 'Assess risk of a yield opportunity',
        parameters: {
          type: 'object',
          properties: {
            protocol: { type: 'string' },
            asset: { type: 'string' }
          },
          required: ['protocol', 'asset']
        }
      },
      {
        name: 'supply_asset',
        description: 'Supply asset to lending protocol',
        parameters: {
          type: 'object',
          properties: {
            asset: { type: 'string' },
            amount: { type: 'string' },
            protocol: { type: 'string' }
          },
          required: ['asset', 'amount', 'protocol']
        }
      },
      {
        name: 'start_monitoring',
        description: 'Start autonomous portfolio monitoring',
        parameters: {
          type: 'object',
          properties: {
            intervalMinutes: { type: 'number', default: 5 }
          }
        }
      }
    ];
  }

  async executeFunction(name, args) {
    const safeArgs = (() => {
      if (!args || typeof args !== 'object') return args;
      const { amount, asset, protocol, intervalMinutes } = args;
      return { amount, asset, protocol, intervalMinutes };
    })();
    this.log.info('tool.execute', { name, args: safeArgs });

    switch (name) {
      case 'get_portfolio':
        return await this.defiManager.getPortfolio();

      case 'get_yields':
        return await this.defiManager.getAvailableYields();

      case 'assess_risk':
        const yields = await this.defiManager.getAvailableYields();
        const protocol = String(args.protocol || '').toLowerCase();
        const asset = String(args.asset || '').toUpperCase();
        const opportunity =
          yields.find(y => String(y.protocol || '').toLowerCase() === protocol && String(y.asset || '').toUpperCase() === asset) ||
          yields.find(y => String(y.asset || '').toUpperCase() === asset) ||
          null;
        return this.riskManager.assessYieldOpportunity(opportunity);

      case 'supply_asset':
        // Validate transaction
        const validation = this.riskManager.validateTransaction({
          amount: args.amount,
          userInput: JSON.stringify(args)
        });

        if (!validation.valid) {
          this.log.warn('tool.blocked', { name, issues: validation.issues });
          return { error: 'Transaction validation failed', issues: validation.issues };
        }

        return await this.defiManager.supplyToAave(args.asset, args.amount);

      case 'start_monitoring':
        await this.monitor.startMonitoring(args.intervalMinutes || 5);
        this.log.info('monitor.started', { intervalMinutes: args.intervalMinutes || 5 });
        return { status: 'monitoring started', interval: args.intervalMinutes || 5 };

      default:
        this.log.warn('tool.unknown', { name });
        return { error: 'Unknown function' };
    }
  }
}

// CLI Interface
async function main() {
  const agent = new DeFiAgent();
  await agent.initialize();

  console.log(' Chat with your DeFi agent (type "exit" to quit)\n');
  console.log('Try commands like:');
  console.log('  - "What\'s my portfolio?"');
  console.log('  - "Show me the best yields"');
  console.log('  - "Assess risk for USDT on Aave"');
  console.log('  - "Start monitoring my portfolio"\n');

  // Example interactions for demo
  const demoCommands = [
    "What's my current portfolio?",
    "Show me available yields",
    "What's the best yield opportunity right now?"
  ];

  for (const cmd of demoCommands) {
    await agent.chat(cmd);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n Demo complete! Run with interactive mode for full chat.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
