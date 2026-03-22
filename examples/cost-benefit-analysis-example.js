/**
 * Cost-Benefit Analysis Example
 * 
 * Demonstrates how to use calculateCostBenefit() to evaluate rebalancing operations
 * Requirements: 6.4, 6.5, 7.6
 */

import { GasOptimizer } from '../src/utils/gas-optimizer.js';

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('💰 COST-BENEFIT ANALYSIS EXAMPLE');
  console.log('='.repeat(60));

  // Initialize Gas Optimizer
  const gasOptimizer = new GasOptimizer({
    chainId: 1,
    gasThresholds: {
      1: 50,
      42161: 0.1,
      10: 0.01
    }
  });

  await gasOptimizer.initialize();
  console.log('✅ Gas Optimizer initialized\n');

  // Example 1: Profitable rebalancing on Ethereum
  console.log('📊 Example 1: Profitable Rebalancing on Ethereum');
  console.log('-'.repeat(60));
  
  const operation1 = {
    currentAPY: 5.0,
    newAPY: 6.5,
    positionSizeUSD: 50000,
    estimatedGas: 250000,
    chainId: 1
  };

  const analysis1 = await gasOptimizer.calculateCostBenefit(operation1, {
    ethPriceUSD: 2000
  });

  console.log('\n📈 Decision Summary:');
  console.log(`   ${analysis1.shouldExecute ? '✅ EXECUTE' : '❌ REJECT'}`);
  console.log(`   Reason: ${analysis1.recommendation}`);
  console.log(`   Net APY Improvement: ${analysis1.yieldAnalysis.netAPYImprovement.toFixed(4)}%`);
  console.log(`   Break-even: ${analysis1.breakEven.breakEvenDays.toFixed(1)} days`);

  // Example 2: Small position with high gas cost (should reject)
  console.log('\n\n📊 Example 2: Small Position with High Gas Cost');
  console.log('-'.repeat(60));
  
  const operation2 = {
    currentAPY: 5.0,
    newAPY: 8.0,
    positionSizeUSD: 1000, // Small position
    estimatedGas: 300000,  // High gas
    chainId: 1
  };

  const analysis2 = await gasOptimizer.calculateCostBenefit(operation2, {
    ethPriceUSD: 2000
  });

  console.log('\n📈 Decision Summary:');
  console.log(`   ${analysis2.shouldExecute ? '✅ EXECUTE' : '❌ REJECT'}`);
  console.log(`   Reason: ${analysis2.recommendation}`);
  console.log(`   Gas Cost: ${analysis2.gasCosts.gasCostPercentage.toFixed(2)}% of position`);
  console.log(`   Threshold: 2.00%`);

  // Example 3: Comparing Ethereum vs Arbitrum
  console.log('\n\n📊 Example 3: Ethereum vs Arbitrum Comparison');
  console.log('-'.repeat(60));
  
  const operationEth = {
    currentAPY: 5.0,
    newAPY: 5.8,
    positionSizeUSD: 10000,
    estimatedGas: 200000,
    chainId: 1
  };

  const operationArb = {
    ...operationEth,
    chainId: 42161
  };

  const analysisEth = await gasOptimizer.calculateCostBenefit(operationEth, {
    ethPriceUSD: 2000
  });

  const analysisArb = await gasOptimizer.calculateCostBenefit(operationArb, {
    ethPriceUSD: 2000
  });

  console.log('\n🔷 Ethereum:');
  console.log(`   Gas Cost: $${analysisEth.gasCosts.gasCostUSD.toFixed(2)}`);
  console.log(`   Break-even: ${analysisEth.breakEven.breakEvenDays.toFixed(1)} days`);
  console.log(`   Net Annual Benefit: $${analysisEth.yieldAnalysis.netAnnualBenefitUSD.toFixed(2)}`);
  console.log(`   Recommendation: ${analysisEth.shouldExecute ? '✅ Execute' : '❌ Reject'}`);

  console.log('\n🔶 Arbitrum:');
  console.log(`   Gas Cost: $${analysisArb.gasCosts.gasCostUSD.toFixed(2)}`);
  console.log(`   Break-even: ${analysisArb.breakEven.breakEvenDays.toFixed(1)} days`);
  console.log(`   Net Annual Benefit: $${analysisArb.yieldAnalysis.netAnnualBenefitUSD.toFixed(2)}`);
  console.log(`   Recommendation: ${analysisArb.shouldExecute ? '✅ Execute' : '❌ Reject'}`);

  const savings = analysisEth.gasCosts.gasCostUSD - analysisArb.gasCosts.gasCostUSD;
  console.log(`\n💡 Gas Savings on Arbitrum: $${savings.toFixed(2)} (${((savings / analysisEth.gasCosts.gasCostUSD) * 100).toFixed(1)}%)`);

  // Example 4: Marginal yield improvement
  console.log('\n\n📊 Example 4: Marginal Yield Improvement');
  console.log('-'.repeat(60));
  
  const operation4 = {
    currentAPY: 5.0,
    newAPY: 5.1, // Only 0.1% improvement
    positionSizeUSD: 10000,
    estimatedGas: 200000,
    chainId: 1
  };

  const analysis4 = await gasOptimizer.calculateCostBenefit(operation4, {
    ethPriceUSD: 2000
  });

  console.log('\n📈 Decision Summary:');
  console.log(`   ${analysis4.shouldExecute ? '✅ EXECUTE' : '❌ REJECT'}`);
  console.log(`   Reason: ${analysis4.recommendation}`);
  console.log(`   APY Improvement: ${analysis4.yieldAnalysis.apyImprovement.toFixed(2)}%`);
  console.log(`   Break-even: ${analysis4.breakEven.breakEvenDays.toFixed(0)} days (${analysis4.breakEven.breakEvenMonths.toFixed(1)} months)`);

  // Example 5: Time horizon projections
  console.log('\n\n📊 Example 5: Time Horizon Projections');
  console.log('-'.repeat(60));
  
  const operation5 = {
    currentAPY: 5.0,
    newAPY: 6.0,
    positionSizeUSD: 25000,
    estimatedGas: 200000,
    chainId: 1
  };

  const analysis5 = await gasOptimizer.calculateCostBenefit(operation5, {
    ethPriceUSD: 2000
  });

  console.log('\n📅 Projected Net Returns:');
  console.log(`   7 days:   $${analysis5.projections['7days'].toFixed(2)}`);
  console.log(`   30 days:  $${analysis5.projections['30days'].toFixed(2)}`);
  console.log(`   90 days:  $${analysis5.projections['90days'].toFixed(2)}`);
  console.log(`   365 days: $${analysis5.projections['365days'].toFixed(2)}`);

  console.log('\n💡 Insight: Returns become positive after break-even at day ' + 
    analysis5.breakEven.breakEvenDays.toFixed(0));

  // Example 6: Batch analysis for multiple opportunities
  console.log('\n\n📊 Example 6: Batch Analysis - Multiple Opportunities');
  console.log('-'.repeat(60));
  
  const opportunities = [
    { name: 'Aave USDC', currentAPY: 5.0, newAPY: 6.5, positionSizeUSD: 20000, estimatedGas: 200000 },
    { name: 'Compound DAI', currentAPY: 4.5, newAPY: 6.0, positionSizeUSD: 15000, estimatedGas: 220000 },
    { name: 'Spark USDT', currentAPY: 5.2, newAPY: 6.8, positionSizeUSD: 18000, estimatedGas: 210000 },
    { name: 'Aave FRAX', currentAPY: 4.8, newAPY: 5.5, positionSizeUSD: 12000, estimatedGas: 200000 }
  ];

  console.log('\n📋 Analyzing opportunities...\n');

  const analyses = [];
  for (const opp of opportunities) {
    const analysis = await gasOptimizer.calculateCostBenefit({
      ...opp,
      chainId: 1
    }, {
      ethPriceUSD: 2000
    });
    
    analyses.push({
      name: opp.name,
      analysis
    });
  }

  // Sort by net annual benefit
  analyses.sort((a, b) => 
    b.analysis.yieldAnalysis.netAnnualBenefitUSD - a.analysis.yieldAnalysis.netAnnualBenefitUSD
  );

  console.log('🏆 Ranked by Net Annual Benefit:\n');
  analyses.forEach((item, index) => {
    const a = item.analysis;
    console.log(`${index + 1}. ${item.name}`);
    console.log(`   APY: ${a.currentAPY.toFixed(2)}% → ${a.newAPY.toFixed(2)}%`);
    console.log(`   Net Benefit: $${a.yieldAnalysis.netAnnualBenefitUSD.toFixed(2)}/year`);
    console.log(`   Break-even: ${a.breakEven.breakEvenDays.toFixed(0)} days`);
    console.log(`   ${a.shouldExecute ? '✅ Execute' : '❌ Skip'}\n`);
  });

  // Summary
  const executable = analyses.filter(a => a.analysis.shouldExecute);
  const totalBenefit = executable.reduce((sum, a) => 
    sum + a.analysis.yieldAnalysis.netAnnualBenefitUSD, 0
  );

  console.log('📊 Summary:');
  console.log(`   Executable Opportunities: ${executable.length}/${analyses.length}`);
  console.log(`   Total Net Annual Benefit: $${totalBenefit.toFixed(2)}`);

  // Cleanup
  await gasOptimizer.cleanup();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Example completed successfully');
  console.log('='.repeat(60) + '\n');
}

// Run example
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
