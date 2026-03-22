// AI Provider abstraction - supports OpenAI and Groq
import { createRequire } from 'module';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);

export class AIProvider {
  constructor() {
    this.provider = process.env.AI_PROVIDER || 'demo';
    this.client = null;
    this.model = null;
  }

  async initialize() {
    if (this.provider === 'demo') {
      return this.initializeDemo();
    } else if (this.provider === 'groq') {
      return this.initializeGroq();
    } else {
      return this.initializeOpenAI();
    }
  }

  async initializeDemo() {
    console.log(' Using Demo AI (for testing without API key)');
    console.log(' For production, get free API key: https://console.groq.com/keys');
    this.model = 'demo-model';
    this.client = { demo: true };
    return true;
  }

  async initializeGroq() {
    try {
      const Groq = require('groq-sdk').default || require('groq-sdk');
      
      if (!process.env.GROQ_API_KEY) {
        console.log('\n🆓 Get a FREE Groq API key:');
        console.log('   1. Visit: https://console.groq.com/keys');
        console.log('   2. Sign up (free)');
        console.log('   3. Create API key');
        console.log('   4. Add to .env: GROQ_API_KEY=your-key\n');
        throw new Error('GROQ_API_KEY not configured');
      }

      this.client = new Groq({
        apiKey: process.env.GROQ_API_KEY
      });
      
      this.model = 'llama-3.3-70b-versatile'; // Fast and capable
      console.log(' Using Groq AI (FREE) - Model: llama-3.3-70b-versatile');
      return true;
    } catch (error) {
      console.error(' Groq initialization failed:', error.message);
      throw error;
    }
  }

  async initializeOpenAI() {
    try {
      const OpenAI = require('openai').default || require('openai');
      
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      this.model = 'gpt-4';
      console.log(' Using OpenAI - Model: gpt-4');
      return true;
    } catch (error) {
      console.error(' OpenAI initialization failed:', error.message);
      throw error;
    }
  }

  async chat(messages, functions = null) {
    try {
      // Demo mode - return mock responses
      if (this.provider === 'demo') {
        return this.getDemoResponse(messages);
      }

      const params = {
        model: this.model,
        messages: messages
      };

      // Add tool calling support for both providers
      if (functions) {
        params.tools = functions.map(f => ({ type: 'function', function: f }));
        params.tool_choice = 'auto';
      }
      
      const response = await this.client.chat.completions.create(params);
      return response.choices[0].message;
    } catch (error) {
      console.error(' AI chat error:', error.message);
      throw error;
    }
  }

  getDemoResponse(messages) {
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content.toLowerCase();

    // Generate contextual demo responses
    if (content.includes('portfolio')) {
      return {
        role: 'assistant',
        content: 'I can see your portfolio is currently empty. You have 0 USDT supplied to Aave V3. Would you like me to show you available yield opportunities?'
      };
    } else if (content.includes('yield')) {
      return {
        role: 'assistant',
        content: 'I found several yield opportunities:\n\n1. Aave V3 USDT: 3.45% APY (Low risk)\n2. Aave V3 USDC: 3.82% APY (Low risk)\n3. Aave V3 DAI: 4.15% APY (Low risk)\n\nThe best option is DAI on Aave V3 with 4.15% APY. Would you like me to assess the risk?'
      };
    } else if (content.includes('risk')) {
      return {
        role: 'assistant',
        content: 'Risk Assessment for USDT on Aave V3:\n\n APY: 3.45% (above 3% threshold)\n Liquidity: $125M (excellent)\n Protocol Risk: Low (Aave is battle-tested)\n\nRecommendation: APPROVED\nRisk Score: 85/100\n\nThis is a safe opportunity for yield generation.'
      };
    } else {
      return {
        role: 'assistant',
        content: 'I\'m your DeFi Portfolio Manager Agent. I can help you:\n\n• Check your portfolio\n• Find yield opportunities\n• Assess risks\n• Supply assets to Aave\n• Monitor and rebalance\n\nWhat would you like to do?'
      };
    }
  }

  supportsFunction() {
    return this.provider === 'openai';
  }
}
