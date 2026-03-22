// Risk Management and Safety Checks

export class RiskManager {
  constructor(config = {}) {
    this.config = {
      maxPositionSize: parseFloat(config.maxPositionSize || process.env.MAX_POSITION_SIZE_USDT || '1000'),
      minAPY: parseFloat(config.minAPY || process.env.MIN_APY_THRESHOLD || '3.0'),
      rebalanceThreshold: parseFloat(config.rebalanceThreshold || process.env.REBALANCE_THRESHOLD || '0.5')
    };
  }

  assessYieldOpportunity(opportunity) {
    const risks = [];
    const score = { total: 100, breakdown: {} };

    // APY check
    if (opportunity.supplyAPY < this.config.minAPY) {
      risks.push(`APY ${opportunity.supplyAPY}% below minimum threshold ${this.config.minAPY}%`);
      score.breakdown.apy = -20;
      score.total -= 20;
    } else {
      score.breakdown.apy = 0;
    }

    // Liquidity check
    const liquidityUSD = parseFloat(opportunity.liquidity);
    if (liquidityUSD < 1000000) {
      risks.push('Low liquidity - potential slippage risk');
      score.breakdown.liquidity = -15;
      score.total -= 15;
    } else {
      score.breakdown.liquidity = 0;
    }

    // Protocol risk
    const protocolRiskScores = {
      'low': 0,
      'medium': -10,
      'high': -30
    };
    score.breakdown.protocol = protocolRiskScores[opportunity.risk] || -10;
    score.total += score.breakdown.protocol;

    // Overall assessment
    let recommendation = 'APPROVED';
    if (score.total < 50) {
      recommendation = 'REJECTED';
    } else if (score.total < 70) {
      recommendation = 'CAUTION';
    }

    return {
      opportunity,
      risks,
      score,
      recommendation,
      timestamp: new Date().toISOString()
    };
  }

  validateTransaction(tx) {
    const issues = [];

    // Amount validation
    if (tx.amount && parseFloat(tx.amount) > this.config.maxPositionSize) {
      issues.push({
        severity: 'CRITICAL',
        message: `Amount ${tx.amount} exceeds max position size ${this.config.maxPositionSize}`
      });
    }

    // Address validation
    if (tx.to && !this.isValidAddress(tx.to)) {
      issues.push({
        severity: 'CRITICAL',
        message: 'Invalid recipient address'
      });
    }

    // Prompt injection detection
    if (tx.userInput && this.detectPromptInjection(tx.userInput)) {
      issues.push({
        severity: 'CRITICAL',
        message: 'Potential prompt injection detected'
      });
    }

    return {
      valid: issues.filter(i => i.severity === 'CRITICAL').length === 0,
      issues,
      timestamp: new Date().toISOString()
    };
  }

  isValidAddress(address) {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  detectPromptInjection(input) {
    const suspiciousPatterns = [
      /ignore previous instructions/i,
      /disregard all/i,
      /system prompt/i,
      /you are now/i,
      /forget everything/i,
      /new instructions/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(input));
  }

  shouldRebalance(currentPositions, optimalPositions) {
    // Calculate position drift
    for (const asset in currentPositions) {
      const current = parseFloat(currentPositions[asset]);
      const optimal = parseFloat(optimalPositions[asset] || 0);
      const drift = Math.abs(current - optimal) / Math.max(current, optimal, 1);

      if (drift > this.config.rebalanceThreshold) {
        return {
          shouldRebalance: true,
          reason: `${asset} drift ${(drift * 100).toFixed(2)}% exceeds threshold ${(this.config.rebalanceThreshold * 100).toFixed(2)}%`,
          asset,
          currentAmount: current,
          optimalAmount: optimal
        };
      }
    }

    return { shouldRebalance: false };
  }

  generateRiskReport(positions, yields) {
    const report = {
      timestamp: new Date().toISOString(),
      overallRisk: 'LOW',
      positions: [],
      recommendations: []
    };

    // Analyze each position
    for (const position of positions) {
      const positionRisk = {
        asset: position.asset,
        amount: position.amount,
        exposure: (parseFloat(position.amount) / this.config.maxPositionSize * 100).toFixed(2) + '%',
        apy: position.apy,
        risk: 'LOW'
      };

      if (parseFloat(position.amount) > this.config.maxPositionSize * 0.8) {
        positionRisk.risk = 'MEDIUM';
        report.recommendations.push(`Consider reducing ${position.asset} position`);
      }

      report.positions.push(positionRisk);
    }

    // Check for better opportunities
    const currentAPYs = positions.map(p => parseFloat(p.apy));
    const maxCurrentAPY = Math.max(...currentAPYs, 0);
    
    for (const y of yields) {
      if (y.supplyAPY > maxCurrentAPY + 1.0) {
        report.recommendations.push(
          `Consider ${y.asset} on ${y.protocol} (${y.supplyAPY}% APY)`
        );
      }
    }

    return report;
  }
}
