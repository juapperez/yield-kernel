/**
 * Strategy Engine - Autonomous investment decision-making
 * 
 * Implements multiple investment strategies (Conservative, Balanced, Aggressive)
 * with autonomous decision-making, portfolio optimization, and decision logging.
 * 
 * Requirements: 4.1, 4.6
 */

/**
 * Strategy types supported by the engine
 */
export const StrategyType = {
  CONSERVATIVE: 'conservative',
  BALANCED: 'balanced',
  AGGRESSIVE: 'aggressive',
  CUSTOM: 'custom'
};

/**
 * Default strategy parameters
 */
const DEFAULT_STRATEGIES = {
  [StrategyType.CONSERVATIVE]: {
    name: 'Conservative',
    description: 'Maximize safety with stable returns',
    riskTolerance: 30, // 0-100 scale
    maxLeverage: 1.0, // No leverage
    rebalanceThreshold: 1.0, // 1.0% APY improvement required
    maxPositionSize: 0.5, // 50% max per protocol
    allowedProtocols: ['aave-v3', 'compound-v3'], // Blue-chip only
    minProtocolRiskScore: 70, // High quality protocols only
    targetHealthFactor: 3.0 // Very safe
  },
  
  [StrategyType.BALANCED]: {
    name: 'Balanced',
    description: 'Balance risk and return',
    riskTolerance: 60,
    maxLeverage: 1.5,
    rebalanceThreshold: 0.5, // 0.5% APY improvement
    maxPositionSize: 0.4, // 40% max per protocol
    allowedProtocols: null, // All established protocols
    minProtocolRiskScore: 50,
    targetHealthFactor: 2.5
  },
  
  [StrategyType.AGGRESSIVE]: {
    name: 'Aggressive',
    description: 'Maximize returns',
    riskTolerance: 90,
    maxLeverage: 3.0,
    rebalanceThreshold: 0.3, // 0.3% APY improvement
    maxPositionSize: 0.3, // 30% max per protocol
    allowedProtocols: null, // All vetted protocols
    minProtocolRiskScore: 30,
    targetHealthFactor: 2.0
  }
};

/**
 * Risk-free rate for Sharpe ratio calculations (3-month US Treasury)
 */
const RISK_FREE_RATE = 0.05; // 5%

/**
 * Strategy Engine class
 */
export class StrategyEngine {
  constructor(config = {}) {
    // Active strategy
    this.activeStrategy = null;
    this.strategyType = null;
    this.customParams = null;
    
    // Decision logging
    this.decisionLog = [];
    this.maxLogSize = config.maxLogSize || 1000;
    
    // Performance tracking
    this.performanceMetrics = {
      totalDecisions: 0,
      successfulDecisions: 0,
      failedDecisions: 0,
      totalReturnGenerated: 0,
      averageAPYImprovement: 0
    };
    
    // Integration points
    this.protocolRegistry = config.protocolRegistry || null;
    this.priceOracle = config.priceOracle || null;
    this.riskEngine = config.riskEngine || null;
    
    // Configuration
    this.riskFreeRate = config.riskFreeRate || RISK_FREE_RATE;
    
    console.log(' Strategy Engine initialized');
  }

  /**
   * Set the active investment strategy
   * 
   * @param {string} strategyType - Strategy type (conservative, balanced, aggressive, custom)
   * @param {Object} customParams - Custom parameters (required if strategyType is 'custom')
   * @returns {Object} Active strategy configuration
   */
  setStrategy(strategyType, customParams = null) {
    // Validate strategy type
    if (!Object.values(StrategyType).includes(strategyType)) {
      throw new Error(
        `Invalid strategy type: ${strategyType}. Must be one of: ${Object.values(StrategyType).join(', ')}`
      );
    }

    // Handle custom strategy
    if (strategyType === StrategyType.CUSTOM) {
      if (!customParams) {
        throw new Error('Custom parameters required for custom strategy');
      }
      
      // Validate custom parameters
      this._validateStrategyParams(customParams);
      
      this.activeStrategy = {
        name: customParams.name || 'Custom',
        description: customParams.description || 'Custom strategy',
        ...customParams
      };
      this.customParams = customParams;
    } else {
      // Use predefined strategy
      this.activeStrategy = { ...DEFAULT_STRATEGIES[strategyType] };
    }

    this.strategyType = strategyType;

    // Log strategy change
    this._logDecision({
      type: 'strategy_change',
      strategyType,
      parameters: this.activeStrategy,
      rationale: `Strategy changed to ${this.activeStrategy.name}`,
      timestamp: Date.now()
    });

    console.log(` Strategy set to: ${this.activeStrategy.name}`);
    console.log(`   Risk Tolerance: ${this.activeStrategy.riskTolerance}/100`);
    console.log(`   Max Leverage: ${this.activeStrategy.maxLeverage}x`);
    console.log(`   Rebalance Threshold: ${this.activeStrategy.rebalanceThreshold}%`);

    return this.activeStrategy;
  }

  /**
   * Get the currently active strategy
   * 
   * @returns {Object} Active strategy configuration
   */
  getActiveStrategy() {
    if (!this.activeStrategy) {
      throw new Error('No strategy set. Call setStrategy() first.');
    }

    return {
      type: this.strategyType,
      ...this.activeStrategy
    };
  }

  /**
   * Calculate optimal portfolio allocation
   * 
   * @param {Array} currentPositions - Current portfolio positions
   * @param {Array} availableYields - Available yield opportunities
   * @param {Object} constraints - Additional constraints
   * @returns {Object} Optimal allocation
   */
  calculateOptimalAllocation(currentPositions, availableYields, constraints = {}) {
    if (!this.activeStrategy) {
      throw new Error('No strategy set. Call setStrategy() first.');
    }

    // Filter opportunities by strategy constraints
    const eligibleYields = this._filterYieldsByStrategy(availableYields);

    // Calculate metrics for each opportunity
    const metrics = eligibleYields.map(opportunity => ({
      opportunity,
      expectedReturn: opportunity.totalAPY || 0,
      risk: this._calculateOpportunityRisk(opportunity),
      sharpeRatio: this._calculateSharpeRatio(opportunity)
    }));

    // Sort by Sharpe ratio (risk-adjusted return)
    metrics.sort((a, b) => b.sharpeRatio - a.sharpeRatio);

    // Allocate capital greedily while respecting constraints
    const allocation = this._allocateCapital(metrics, constraints);

    // Log allocation decision
    this._logDecision({
      type: 'allocation_calculated',
      currentPositions: currentPositions.length,
      availableYields: availableYields.length,
      eligibleYields: eligibleYields.length,
      allocation,
      rationale: `Calculated optimal allocation using ${this.activeStrategy.name} strategy`,
      timestamp: Date.now()
    });

    return allocation;
  }

  /**
   * Determine if portfolio should be rebalanced
   * 
   * Evaluates rebalancing by comparing:
   * - Current allocation vs optimal allocation
   * - Expected APY improvement
   * - Gas costs (if provided)
   * - Break-even time (should be < 30 days)
   * 
   * @param {Object} currentAllocation - Current portfolio allocation
   * @param {Object} optimalAllocation - Optimal allocation from calculateOptimalAllocation
   * @param {Object} options - Optional parameters
   * @param {number} options.portfolioValueUSD - Total portfolio value in USD
   * @param {number} options.estimatedGasCostUSD - Estimated gas cost for rebalancing in USD
   * @param {number} options.maxBreakEvenDays - Maximum acceptable break-even time (default: 30 days)
   * @returns {Object} Rebalance decision with rationale
   */
  shouldRebalance(currentAllocation, optimalAllocation, options = {}) {
    if (!this.activeStrategy) {
      throw new Error('No strategy set. Call setStrategy() first.');
    }

    // Calculate APY improvement
    const currentAPY = currentAllocation.expectedAPY || 0;
    const optimalAPY = optimalAllocation.expectedAPY || 0;
    const apyImprovement = optimalAPY - currentAPY;

    // Check if improvement exceeds threshold
    let shouldRebalance = apyImprovement >= this.activeStrategy.rebalanceThreshold;
    let rationale = shouldRebalance
      ? `Rebalancing recommended: ${apyImprovement.toFixed(2)}% APY improvement exceeds threshold of ${this.activeStrategy.rebalanceThreshold}%`
      : `Rebalancing not recommended: ${apyImprovement.toFixed(2)}% APY improvement below threshold of ${this.activeStrategy.rebalanceThreshold}%`;

    // Additional gas cost analysis if provided
    let gasCostAnalysis = null;
    if (options.portfolioValueUSD && options.estimatedGasCostUSD) {
      gasCostAnalysis = this._analyzeGasCostBenefit(
        apyImprovement,
        options.portfolioValueUSD,
        options.estimatedGasCostUSD,
        options.maxBreakEvenDays || 30
      );

      // Override decision if gas costs are too high
      if (shouldRebalance && !gasCostAnalysis.worthwhile) {
        shouldRebalance = false;
        rationale = gasCostAnalysis.rationale;
      }
    }

    const decision = {
      shouldRebalance,
      apyImprovement,
      threshold: this.activeStrategy.rebalanceThreshold,
      currentAPY,
      optimalAPY,
      gasCostAnalysis,
      rationale,
      timestamp: Date.now()
    };

    // Log decision
    this._logDecision({
      type: 'rebalance_decision',
      ...decision
    });

    return decision;
  }

  /**
   * Analyze gas cost vs benefit for rebalancing
   * 
   * @private
   * @param {number} apyImprovement - APY improvement percentage
   * @param {number} portfolioValueUSD - Portfolio value in USD
   * @param {number} gasCostUSD - Gas cost in USD
   * @param {number} maxBreakEvenDays - Maximum acceptable break-even days
   * @returns {Object} Gas cost analysis
   */
  _analyzeGasCostBenefit(apyImprovement, portfolioValueUSD, gasCostUSD, maxBreakEvenDays) {
    // Calculate annual benefit from APY improvement
    const annualBenefitUSD = portfolioValueUSD * (apyImprovement / 100);
    
    // Calculate daily benefit
    const dailyBenefitUSD = annualBenefitUSD / 365;
    
    // Calculate break-even time in days
    const breakEvenDays = dailyBenefitUSD > 0 ? gasCostUSD / dailyBenefitUSD : Infinity;
    
    // Calculate gas cost as percentage of portfolio
    const gasCostPercentage = (gasCostUSD / portfolioValueUSD) * 100;
    
    // Determine if rebalancing is worthwhile
    const worthwhile = breakEvenDays < maxBreakEvenDays && gasCostPercentage < 2.0;
    
    let rationale;
    if (!worthwhile) {
      if (breakEvenDays >= maxBreakEvenDays) {
        rationale = `Rebalancing not worthwhile: Break-even time ${breakEvenDays.toFixed(1)} days exceeds maximum ${maxBreakEvenDays} days. Gas cost ($${gasCostUSD.toFixed(2)}) too high relative to expected benefit ($${annualBenefitUSD.toFixed(2)}/year).`;
      } else {
        rationale = `Rebalancing not worthwhile: Gas cost ${gasCostPercentage.toFixed(2)}% of portfolio exceeds 2% threshold.`;
      }
    } else {
      rationale = `Rebalancing worthwhile: Break-even time ${breakEvenDays.toFixed(1)} days < ${maxBreakEvenDays} days. Expected annual benefit: $${annualBenefitUSD.toFixed(2)}, Gas cost: $${gasCostUSD.toFixed(2)}.`;
    }
    
    return {
      worthwhile,
      breakEvenDays,
      annualBenefitUSD,
      dailyBenefitUSD,
      gasCostUSD,
      gasCostPercentage,
      maxBreakEvenDays,
      rationale
    };
  }

  /**
   * Create execution plan for rebalancing
   * 
   * @param {Object} fromAllocation - Current allocation
   * @param {Object} toAllocation - Target allocation
   * @returns {Object} Execution plan with steps
   */
  createRebalancePlan(fromAllocation, toAllocation) {
    const steps = [];
    const fromPositions = fromAllocation.positions || new Map();
    const toPositions = toAllocation.positions || new Map();

    // Identify positions to exit (in current but not in target)
    for (const [key, position] of fromPositions) {
      if (!toPositions.has(key)) {
        steps.push({
          action: 'withdraw',
          protocol: position.protocol,
          asset: position.asset,
          amount: position.amount,
          reason: 'Exit position'
        });
      }
    }

    // Identify positions to enter or increase
    for (const [key, position] of toPositions) {
      const currentPosition = fromPositions.get(key);
      
      if (!currentPosition) {
        // New position
        steps.push({
          action: 'supply',
          protocol: position.protocol,
          asset: position.asset,
          amount: position.amount,
          reason: 'Enter new position'
        });
      } else if (position.amount > currentPosition.amount) {
        // Increase position
        steps.push({
          action: 'supply',
          protocol: position.protocol,
          asset: position.asset,
          amount: position.amount - currentPosition.amount,
          reason: 'Increase position'
        });
      } else if (position.amount < currentPosition.amount) {
        // Decrease position
        steps.push({
          action: 'withdraw',
          protocol: position.protocol,
          asset: position.asset,
          amount: currentPosition.amount - position.amount,
          reason: 'Decrease position'
        });
      }
    }

    const plan = {
      steps,
      totalSteps: steps.length,
      estimatedGas: steps.length * 150000, // Rough estimate
      fromAllocation,
      toAllocation,
      createdAt: Date.now()
    };

    // Log plan creation
    this._logDecision({
      type: 'rebalance_plan_created',
      stepCount: steps.length,
      rationale: `Created rebalancing plan with ${steps.length} steps`,
      timestamp: Date.now()
    });

    return plan;
  }

  /**
   * Record decision outcome for learning
   * 
   * @param {Object} decision - Original decision
   * @param {Object} outcome - Actual outcome
   */
  recordDecision(decision, outcome) {
    // Update performance metrics
    this.performanceMetrics.totalDecisions++;
    
    if (outcome.success) {
      this.performanceMetrics.successfulDecisions++;
      
      if (outcome.apyImprovement !== undefined) {
        this.performanceMetrics.totalReturnGenerated += outcome.apyImprovement;
        this.performanceMetrics.averageAPYImprovement = 
          this.performanceMetrics.totalReturnGenerated / this.performanceMetrics.successfulDecisions;
      }
    } else {
      this.performanceMetrics.failedDecisions++;
    }

    // Store detailed decision record for learning
    const decisionRecord = {
      type: 'decision_outcome',
      originalDecision: decision,
      outcome,
      timestamp: Date.now(),
      expectedAPYImprovement: decision.apyImprovement || decision.expectedAPYImprovement,
      actualAPYImprovement: outcome.apyImprovement,
      gasCostUSD: outcome.gasCostUSD,
      success: outcome.success,
      failureReason: outcome.failureReason
    };

    // Log outcome
    this._logDecision(decisionRecord);

    console.log(` Decision recorded: ${outcome.success ? 'Success' : 'Failed'}`);
    
    // Trigger strategy adjustment if we have enough data
    if (this.performanceMetrics.totalDecisions % 10 === 0) {
      this.adjustStrategy(this.getPerformanceMetrics());
    }
  }

  /**
   * Get performance metrics
   * 
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    const successRate = this.performanceMetrics.totalDecisions > 0
      ? (this.performanceMetrics.successfulDecisions / this.performanceMetrics.totalDecisions) * 100
      : 0;

    const winRate = this.performanceMetrics.totalDecisions > 0
      ? (this.performanceMetrics.successfulDecisions / this.performanceMetrics.totalDecisions) * 100
      : 0;

    // Calculate Sharpe ratio from decision history
    const sharpeRatio = this._calculateDecisionSharpeRatio();

    return {
      ...this.performanceMetrics,
      successRate: successRate.toFixed(2) + '%',
      winRate: winRate.toFixed(2) + '%',
      sharpeRatio: sharpeRatio.toFixed(3),
      strategy: this.strategyType,
      strategyName: this.activeStrategy?.name || 'None'
    };
  }

  /**
   * Get decision log
   * 
   * @param {Object} filters - Optional filters
   * @returns {Array} Filtered decision log
   */
  getDecisionLog(filters = {}) {
    let log = [...this.decisionLog];

    // Apply filters
    if (filters.type) {
      log = log.filter(entry => entry.type === filters.type);
    }

    if (filters.since) {
      log = log.filter(entry => entry.timestamp >= filters.since);
    }

    if (filters.limit) {
      log = log.slice(-filters.limit);
    }

    return log;
  }

  /**
   * Clear decision log
   */
  clearDecisionLog() {
    this.decisionLog = [];
    console.log('  Decision log cleared');
  }

  /**
   * Set integration points
   * 
   * @param {Object} integrations - Integration objects
   */
  setIntegrations(integrations) {
    if (integrations.protocolRegistry) {
      this.protocolRegistry = integrations.protocolRegistry;
    }
    if (integrations.priceOracle) {
      this.priceOracle = integrations.priceOracle;
    }
    if (integrations.riskEngine) {
      this.riskEngine = integrations.riskEngine;
    }

    console.log(' Strategy Engine integrations configured');
  }

  /**
   * Filter yield opportunities by strategy constraints
   * 
   * @private
   * @param {Array} yields - Available yield opportunities
   * @returns {Array} Filtered yields
   */
  _filterYieldsByStrategy(yields) {
    return yields.filter(opportunity => {
      // Check protocol whitelist
      if (this.activeStrategy.allowedProtocols) {
        if (!this.activeStrategy.allowedProtocols.includes(opportunity.protocol)) {
          return false;
        }
      }

      // Check risk score
      const riskScore = opportunity.riskScore || 50;
      if (riskScore < this.activeStrategy.minProtocolRiskScore) {
        return false;
      }

      // Check risk tolerance
      if (opportunity.risk && opportunity.risk === 'high' && this.activeStrategy.riskTolerance < 70) {
        return false;
      }

      return true;
    });
  }

  /**
   * Calculate risk for a yield opportunity
   * 
   * @private
   * @param {Object} opportunity - Yield opportunity
   * @returns {number} Risk score (0-100)
   */
  _calculateOpportunityRisk(opportunity) {
    // Use protocol risk score if available
    if (opportunity.riskScore !== undefined) {
      return 100 - opportunity.riskScore; // Invert: higher score = lower risk
    }

    // Fallback: estimate based on risk level
    const riskLevels = {
      'low': 20,
      'medium': 50,
      'high': 80
    };

    return riskLevels[opportunity.risk] || 50;
  }

  /**
   * Calculate Sharpe ratio for a yield opportunity
   * 
   * @private
   * @param {Object} opportunity - Yield opportunity
   * @returns {number} Sharpe ratio
   */
  _calculateSharpeRatio(opportunity) {
    const expectedReturn = (opportunity.totalAPY || 0) / 100;
    const risk = this._calculateOpportunityRisk(opportunity) / 100;

    // Avoid division by zero
    if (risk === 0) {
      return expectedReturn > this.riskFreeRate ? Infinity : 0;
    }

    return (expectedReturn - this.riskFreeRate) / risk;
  }

  /**
   * Allocate capital across opportunities
   * 
   * @private
   * @param {Array} metrics - Sorted opportunity metrics
   * @param {Object} constraints - Additional constraints
   * @returns {Object} Allocation
   */
  _allocateCapital(metrics, constraints = {}) {
    const positions = new Map();
    let remainingCapital = 100; // Percentage
    const protocolExposure = new Map();

    for (const metric of metrics) {
      const { opportunity } = metric;
      const key = `${opportunity.protocol}:${opportunity.asset}`;

      // Calculate maximum allocation for this position
      let maxAllocation = Math.min(
        remainingCapital,
        this.activeStrategy.maxPositionSize * 100
      );

      // Check protocol exposure limit
      const currentProtocolExposure = protocolExposure.get(opportunity.protocol) || 0;
      const protocolLimit = (this.activeStrategy.maxPositionSize * 100) * 1.5; // Allow 1.5x per protocol
      maxAllocation = Math.min(maxAllocation, protocolLimit - currentProtocolExposure);

      // Apply custom constraints
      if (constraints.maxPerPosition) {
        maxAllocation = Math.min(maxAllocation, constraints.maxPerPosition);
      }

      if (maxAllocation > 0) {
        positions.set(key, {
          protocol: opportunity.protocol,
          asset: opportunity.asset,
          percentage: maxAllocation,
          expectedAPY: opportunity.totalAPY || 0,
          risk: this._calculateOpportunityRisk(opportunity)
        });

        remainingCapital -= maxAllocation;
        protocolExposure.set(
          opportunity.protocol,
          currentProtocolExposure + maxAllocation
        );
      }

      if (remainingCapital <= 0) break;
    }

    // Calculate weighted average APY
    let totalAPY = 0;
    for (const [_, position] of positions) {
      totalAPY += (position.expectedAPY * position.percentage) / 100;
    }

    return {
      positions,
      totalAllocated: 100 - remainingCapital,
      expectedAPY: totalAPY,
      positionCount: positions.size
    };
  }

  /**
   * Validate strategy parameters
   * 
   * @private
   * @param {Object} params - Strategy parameters
   */
  _validateStrategyParams(params) {
    const required = ['riskTolerance', 'maxLeverage', 'rebalanceThreshold', 'maxPositionSize'];
    
    for (const field of required) {
      if (params[field] === undefined) {
        throw new Error(`Missing required parameter: ${field}`);
      }
    }

    // Validate ranges
    if (params.riskTolerance < 0 || params.riskTolerance > 100) {
      throw new Error('riskTolerance must be between 0 and 100');
    }

    if (params.maxLeverage < 1.0 || params.maxLeverage > 10.0) {
      throw new Error('maxLeverage must be between 1.0 and 10.0');
    }

    if (params.rebalanceThreshold < 0 || params.rebalanceThreshold > 10) {
      throw new Error('rebalanceThreshold must be between 0 and 10');
    }

    if (params.maxPositionSize < 0 || params.maxPositionSize > 1.0) {
      throw new Error('maxPositionSize must be between 0 and 1.0');
    }
  }

  /**
   * Log a decision with rationale
   * 
   * @private
   * @param {Object} decision - Decision details
   */
  _logDecision(decision) {
    this.decisionLog.push(decision);

    // Trim log if it exceeds max size
    if (this.decisionLog.length > this.maxLogSize) {
      this.decisionLog.shift();
    }
  }

  /**
   * Calculate Sharpe ratio from decision history
   * 
   * @private
   * @returns {number} Sharpe ratio
   */
  _calculateDecisionSharpeRatio() {
    // Get all successful rebalancing decisions with APY improvements
    const rebalanceDecisions = this.decisionLog.filter(
      entry => entry.type === 'decision_outcome' && 
               entry.originalDecision?.type === 'rebalance_decision' &&
               entry.actualAPYImprovement !== undefined
    );

    if (rebalanceDecisions.length < 2) {
      return 0; // Not enough data
    }

    // Calculate returns (APY improvements)
    const returns = rebalanceDecisions.map(d => d.actualAPYImprovement);

    // Calculate average return
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Calculate standard deviation (volatility)
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Avoid division by zero
    if (volatility === 0) {
      return avgReturn > this.riskFreeRate ? Infinity : 0;
    }

    // Sharpe Ratio = (Average Return - Risk-Free Rate) / Volatility
    return (avgReturn - this.riskFreeRate) / volatility;
  }

  /**
   * Adjust strategy parameters based on performance
   * 
   * Analyzes historical performance and adjusts strategy parameters to improve outcomes.
   * Examples:
   * - If rebalancing decisions consistently fail due to gas costs, increase rebalance threshold
   * - If win rate is low, increase risk tolerance or adjust position sizing
   * - If Sharpe ratio is declining, become more conservative
   * 
   * @param {Object} metrics - Performance metrics
   */
  adjustStrategy(metrics) {
    if (!this.activeStrategy) {
      console.log('  No active strategy to adjust');
      return;
    }

    // Only adjust custom strategies or after significant data
    if (this.strategyType !== StrategyType.CUSTOM && this.performanceMetrics.totalDecisions < 20) {
      return;
    }

    console.log(' Analyzing performance for strategy adjustment...');

    const adjustments = [];

    // Analyze rebalancing decisions
    const rebalanceDecisions = this.decisionLog.filter(
      entry => entry.type === 'decision_outcome' && 
               entry.originalDecision?.type === 'rebalance_decision'
    );

    if (rebalanceDecisions.length >= 5) {
      // Check for gas cost failures
      const gasCostFailures = rebalanceDecisions.filter(
        d => !d.success && d.failureReason && 
             (d.failureReason.toLowerCase().includes('gas') || 
              d.failureReason.toLowerCase().includes('cost'))
      );

      const gasCostFailureRate = gasCostFailures.length / rebalanceDecisions.length;

      if (gasCostFailureRate > 0.3) {
        // More than 30% of rebalancing decisions fail due to gas costs
        // Increase rebalance threshold to reduce frequency
        const oldThreshold = this.activeStrategy.rebalanceThreshold;
        const newThreshold = Math.min(oldThreshold * 1.5, 2.0); // Cap at 2%
        
        this.activeStrategy.rebalanceThreshold = newThreshold;
        
        adjustments.push({
          parameter: 'rebalanceThreshold',
          oldValue: oldThreshold,
          newValue: newThreshold,
          reason: `High gas cost failure rate (${(gasCostFailureRate * 100).toFixed(1)}%)`
        });
      }

      // Check for low profitability
      const successfulRebalances = rebalanceDecisions.filter(d => d.success);
      
      if (successfulRebalances.length >= 3) {
        const avgActualImprovement = successfulRebalances.reduce(
          (sum, d) => sum + (d.actualAPYImprovement || 0), 0
        ) / successfulRebalances.length;

        const avgExpectedImprovement = successfulRebalances.reduce(
          (sum, d) => sum + (d.expectedAPYImprovement || 0), 0
        ) / successfulRebalances.length;

        // If actual improvements are significantly lower than expected
        if (avgActualImprovement < avgExpectedImprovement * 0.7) {
          const oldThreshold = this.activeStrategy.rebalanceThreshold;
          const newThreshold = Math.min(oldThreshold * 1.3, 2.0);
          
          this.activeStrategy.rebalanceThreshold = newThreshold;
          
          adjustments.push({
            parameter: 'rebalanceThreshold',
            oldValue: oldThreshold,
            newValue: newThreshold,
            reason: `Actual improvements (${avgActualImprovement.toFixed(2)}%) below expected (${avgExpectedImprovement.toFixed(2)}%)`
          });
        }
      }
    }

    // Check Sharpe ratio trend first (most important for risk-adjusted returns)
    const sharpeRatio = parseFloat(metrics.sharpeRatio);
    let sharpeRatioLow = false;
    
    if (this.performanceMetrics.totalDecisions >= 15 && sharpeRatio < 0.5 && sharpeRatio > 0) {
      // Poor risk-adjusted returns - reduce position sizes for better diversification
      const oldMaxPosition = this.activeStrategy.maxPositionSize;
      const newMaxPosition = Math.max(oldMaxPosition * 0.9, 0.2);
      
      this.activeStrategy.maxPositionSize = newMaxPosition;
      sharpeRatioLow = true;
      
      adjustments.push({
        parameter: 'maxPositionSize',
        oldValue: oldMaxPosition,
        newValue: newMaxPosition,
        reason: `Low Sharpe ratio (${sharpeRatio.toFixed(2)})`
      });
    }

    // Check overall win rate (but not if Sharpe ratio is already low)
    const winRate = parseFloat(metrics.winRate);
    
    if (this.performanceMetrics.totalDecisions >= 10 && !sharpeRatioLow) {
      if (winRate < 50) {
        // Low win rate - become more conservative
        const oldRiskTolerance = this.activeStrategy.riskTolerance;
        const newRiskTolerance = Math.max(oldRiskTolerance * 0.9, 20);
        
        this.activeStrategy.riskTolerance = newRiskTolerance;
        
        adjustments.push({
          parameter: 'riskTolerance',
          oldValue: oldRiskTolerance,
          newValue: newRiskTolerance,
          reason: `Low win rate (${winRate.toFixed(1)}%)`
        });
      } else if (winRate > 80 && this.strategyType === StrategyType.CUSTOM) {
        // Very high win rate - can be more aggressive
        const oldRiskTolerance = this.activeStrategy.riskTolerance;
        const newRiskTolerance = Math.min(oldRiskTolerance * 1.1, 100);
        
        this.activeStrategy.riskTolerance = newRiskTolerance;
        
        adjustments.push({
          parameter: 'riskTolerance',
          oldValue: oldRiskTolerance,
          newValue: newRiskTolerance,
          reason: `High win rate (${winRate.toFixed(1)}%)`
        });
      }
    }

    // Log adjustments
    if (adjustments.length > 0) {
      console.log(` Strategy adjusted based on performance:`);
      
      for (const adj of adjustments) {
        console.log(`   ${adj.parameter}: ${adj.oldValue.toFixed(2)} → ${adj.newValue.toFixed(2)}`);
        console.log(`   Reason: ${adj.reason}`);
      }

      this._logDecision({
        type: 'strategy_adjustment',
        adjustments,
        metrics,
        timestamp: Date.now()
      });
    } else {
      console.log(' Strategy performing well, no adjustments needed');
    }
  }
}
