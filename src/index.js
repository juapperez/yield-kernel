#!/usr/bin/env node

import { DeFiAgent } from './core/agent.js';
import readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

// Check for required environment variables
if ((!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') && 
    (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here')) {
  console.error('\n ERROR: API KEY not configured');
  console.error('\nPlease:');
  console.error('1. Copy .env.example to .env');
  console.error('2. Add your OpenAI or Groq API key to .env\n');
  process.exit(1);
}

async function runInteractive() {
  const agent = new DeFiAgent();
  
  try {
    await agent.initialize();
    
    console.log('\n Interactive Mode - Chat with your DeFi agent');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Try commands like:');
    console.log('  • "What\'s my portfolio?"');
    console.log('  • "Show me available yields"');
    console.log('  • "Assess risk for USDT on Aave"');
    console.log('  • "Start monitoring my portfolio"');
    console.log('\nType "exit" or "quit" to stop\n');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ' You: '
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      
      if (!input) {
        rl.prompt();
        return;
      }
      
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log('\n Goodbye! Thanks for using DeFi Portfolio Agent.\n');
        rl.close();
        process.exit(0);
      }

      try {
        await agent.chat(input);
      } catch (error) {
        console.error('\n Error:', error.message);
      }
      
      console.log('');
      rl.prompt();
    });

    rl.on('close', () => {
      console.log('\n Goodbye!\n');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n Failed to initialize agent:', error.message);
    process.exit(1);
  }
}

async function runDemo() {
  const agent = new DeFiAgent();
  
  try {
    await agent.initialize();
    
    console.log('\n Running Demo Mode...\n');
    
    const demoCommands = [
      "What's my current portfolio?",
      "Show me available yields",
      "What's the best yield opportunity right now?",
      "Assess the risk for USDT on Aave V3"
    ];

    for (const cmd of demoCommands) {
      await agent.chat(cmd);
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('\n' + '─'.repeat(60) + '\n');
    }

    console.log(' Demo complete!');
    console.log('\n Run in interactive mode: npm start\n');
    
  } catch (error) {
    console.error('\n Demo failed:', error.message);
    process.exit(1);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
const mode = args[0];

if (mode === 'demo') {
  runDemo();
} else {
  runInteractive();
}
