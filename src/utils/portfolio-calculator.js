/**
 * Portfolio Calculator - Real-time portfolio value and yield calculations
 * 
 * Integrates Price Oracle for real-time asset pricing in:
 * - Portfolio value calculations (total value in USD)
 * - Yield calculations (APY with current prices)
 * - Position value calculations (individual position values)
 * 
 * Requirements: 3.4
 */

/**
 * Portfolio Calculator class
 */
export class PortfolioCalculator {
  constructor(config = {}) {
    // Integration points
    this.priceOracle = config.priceOracle || null;
    this.protocolRegistry = config.protocolRegistry || null;
    
    // Configuration
    this.defaultChainId = config.chainId || 1;
    
    console.log(' Portfolio Calculator initialized');
  }

  /**
   * Set integration points
   * 
   * @param {Object} integrations - Integration objects
   */
  setIntegrations(integrations) {
    if (integrations.priceOracle) {
      this.priceOracle = integrations.priceOracle;
    }
    if (integrations.protocolRegistry) {
      this.protocolRegistry = integrations.protocolRegistry;
    }

    console.log(' Portfolio Calculator integrations configured');
  }

  /**
   * Calculate total portfolio value using real-time prices
   * 
   * @param {Array} positions - Array of position objects
   * @returns {Promise<Object>} Portfolio value breakdown
   */
  async calculatePortfolioValue(positions) {
    if (!this.priceOracle) {
      throw new Error('Price Oracle not configured. Call setIntegrations() first.');
    }

    if (!positions || positions.length === 0) {
      return {
        totalValueUSD: 0,
        totalSuppliedUSD: 0,
        totalBorrowedUSD: 0,
        netValueUSD: 0,
        positionValues: [],
        timestamp: Date.now()
      };
    }

    // Extract unique assets from positions
    const uniqueAssets = [...new Set(positions.map(p => p.asset))];

    // Fetch real-time prices for all assets in parallel
    const prices = await this.priceOracle.getPrices(uniqueAssets);

    // Calculate value for each position
    const positionValues = [];
    let totalSuppliedUSD = 0;
    let totalBorrowedUSD = 0;

    for (const position of positions) {
      const priceData = prices.get(position.asset);
      
      if (!priceData) {
        console.warn(`Warning: No price data for ${position.asset}, skipping position`);
        continue;
      }

      const valueUSD = Number(position.amount) * priceData.price;

      const positionValue = {
        protocol: position.protocol,
        asset: position.asset,
        amount: position.amount,
        price: priceData.price,
        valueUSD,
        type: position.type || 'supplied',
        apy: position.apy || 0,
        priceSource: priceData.source,
        priceAge: priceData.age
      };

      positionValues.push(positionValue);

      // Aggregate by position type
      if (position.type === 'borrowed') {
        totalBorrowedUSD += valueUSD;
      } else {
        totalSuppliedUSD += valueUSD;
      }
    }

    const totalValueUSD = totalSuppliedUSD + totalBorrowedUSD;
    const netValueUSD = totalSuppliedUSD - totalBorrowedUSD;

    return {
      totalValueUSD,
      totalSuppliedUSD,
      totalBorrowedUSD,
      netValueUSD,
      positionValues,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate individual position value using real-time prices
   * 
   * @param {Object} position - Position object
   * @returns {Promise<Object>} Position value details
   */
  async calculatePositionValue(position) {
    if (!this.priceOracle) {
      throw new Error('Price Oracle not configured. Call setIntegrations() first.');
    }

    // Fetch real-time price for the asset
    const priceData = await this.priceOracle.getPrice(position.asset);

    const valueUSD = Number(position.amount) * priceData.price;

    return {
      protocol: position.protocol,
      asset: position.asset,
      amount: position.amount,
      price: priceData.price,
      valueUSD,
      type: position.type || 'supplied',
      apy: position.apy || 0,
      priceSource: priceData.source,
      priceAge: priceData.age,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate portfolio-weighted APY using current prices
   * 
   * @param {Array} positions - Array of position objects with APY
   * @returns {Promise<Object>} Weighted APY calculation
   */
  async calculateWeightedAPY(positions) {
    if (!this.priceOracle) {
      throw new Error('Price Oracle not configured. Call setIntegrations() first.');
    }

    if (!positions || positions.length === 0) {
      return {
        weightedAPY: 0,
        totalValueUSD: 0,
        breakdown: [],
        timestamp: Date.now()
      };
    }

    // Calculate portfolio value first
    const portfolioValue = await this.calculatePortfolioValue(positions);

    // Calculate weighted APY
    let weightedAPYSum = 0;
    const breakdown = [];

    for (const positionValue of portfolioValue.positionValues) {
      // Skip borrowed positions (they have negative contribution)
      if (positionValue.type === 'borrowed') {
        continue;
      }

      const weight = positionValue.valueUSD / portfolioValue.totalSuppliedUSD;
      const contribution = weight * positionValue.apy;
      weightedAPYSum += contribution;

      breakdown.push({
        protocol: positionValue.protocol,
        asset: positionValue.asset,
        valueUSD: positionValue.valueUSD,
        weight: weight * 100, // Convert to percentage
        apy: positionValue.apy,
        contribution
      });
    }

    return {
      weightedAPY: weightedAPYSum,
      totalValueUSD: portfolioValue.totalSuppliedUSD,
      breakdown,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate portfolio performance metrics
   * 
   * @param {Array} positions - Current positions
   * @param {Object} previousSnapshot - Previous portfolio snapshot
   * @returns {Promise<Object>} Performance metrics
   */
  async calculatePerformance(positions, previousSnapshot) {
    if (!this.priceOracle) {
      throw new Error('Price Oracle not configured. Call setIntegrations() first.');
    }

    const currentValue = await this.calculatePortfolioValue(positions);
    const currentAPY = await this.calculateWeightedAPY(positions);

    if (!previousSnapshot) {
      return {
        currentValueUSD: currentValue.totalValueUSD,
        previousValueUSD: 0,
        absoluteChange: 0,
        percentageChange: 0,
        currentAPY: currentAPY.weightedAPY,
        timePeriod: 0,
        timestamp: Date.now()
      };
    }

    const absoluteChange = currentValue.totalValueUSD - previousSnapshot.totalValueUSD;
    const percentageChange = previousSnapshot.totalValueUSD > 0
      ? (absoluteChange / previousSnapshot.totalValueUSD) * 100
      : 0;

    const timePeriod = Date.now() - previousSnapshot.timestamp;

    return {
      currentValueUSD: currentValue.totalValueUSD,
      previousValueUSD: previousSnapshot.totalValueUSD,
      absoluteChange,
      percentageChange,
      currentAPY: currentAPY.weightedAPY,
      timePeriod,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate position allocation percentages
   * 
   * @param {Array} positions - Array of position objects
   * @returns {Promise<Object>} Allocation breakdown
   */
  async calculateAllocation(positions) {
    if (!this.priceOracle) {
      throw new Error('Price Oracle not configured. Call setIntegrations() first.');
    }

    const portfolioValue = await this.calculatePortfolioValue(positions);

    if (portfolioValue.totalSuppliedUSD === 0) {
      return {
        totalValueUSD: 0,
        allocations: [],
        timestamp: Date.now()
      };
    }

    const allocations = portfolioValue.positionValues
      .filter(pv => pv.type !== 'borrowed')
      .map(pv => ({
        protocol: pv.protocol,
        asset: pv.asset,
        valueUSD: pv.valueUSD,
        percentage: (pv.valueUSD / portfolioValue.totalSuppliedUSD) * 100,
        apy: pv.apy
      }));

    return {
      totalValueUSD: portfolioValue.totalSuppliedUSD,
      allocations,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate health factor for leveraged positions
   * 
   * @param {Array} positions - Array of position objects
   * @param {number} liquidationThreshold - Liquidation threshold (e.g., 0.85 for 85%)
   * @returns {Promise<Object>} Health factor calculation
   */
  async calculateHealthFactor(positions, liquidationThreshold = 0.85) {
    if (!this.priceOracle) {
      throw new Error('Price Oracle not configured. Call setIntegrations() first.');
    }

    const portfolioValue = await this.calculatePortfolioValue(positions);

    // Calculate collateral value (supplied positions)
    const collateralValueUSD = portfolioValue.totalSuppliedUSD;

    // Calculate borrowed value
    const borrowedValueUSD = portfolioValue.totalBorrowedUSD;

    if (borrowedValueUSD === 0) {
      return {
        healthFactor: Infinity,
        collateralValueUSD,
        borrowedValueUSD,
        liquidationThreshold,
        maxBorrowValueUSD: collateralValueUSD * liquidationThreshold,
        isHealthy: true,
        timestamp: Date.now()
      };
    }

    // Health Factor = (Collateral * Liquidation Threshold) / Borrowed
    const healthFactor = (collateralValueUSD * liquidationThreshold) / borrowedValueUSD;

    return {
      healthFactor,
      collateralValueUSD,
      borrowedValueUSD,
      liquidationThreshold,
      maxBorrowValueUSD: collateralValueUSD * liquidationThreshold,
      isHealthy: healthFactor > 1.0,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate projected portfolio value with yield
   * 
   * @param {Array} positions - Array of position objects
   * @param {number} days - Number of days to project
   * @returns {Promise<Object>} Projected value
   */
  async calculateProjectedValue(positions, days) {
    if (!this.priceOracle) {
      throw new Error('Price Oracle not configured. Call setIntegrations() first.');
    }

    const currentValue = await this.calculatePortfolioValue(positions);
    const weightedAPY = await this.calculateWeightedAPY(positions);

    // Calculate daily rate from APY
    const dailyRate = Math.pow(1 + weightedAPY.weightedAPY / 100, 1 / 365) - 1;

    // Project value
    const projectedValueUSD = currentValue.totalSuppliedUSD * Math.pow(1 + dailyRate, days);
    const projectedGain = projectedValueUSD - currentValue.totalSuppliedUSD;

    return {
      currentValueUSD: currentValue.totalSuppliedUSD,
      projectedValueUSD,
      projectedGain,
      projectedGainPercentage: (projectedGain / currentValue.totalSuppliedUSD) * 100,
      days,
      weightedAPY: weightedAPY.weightedAPY,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate Sharpe ratio for risk-adjusted returns
   * 
   * Requirements: 7.2, 7.3
   * 
   * @param {Array} positions - Array of position objects with APY
   * @param {Array} historicalReturns - Array of daily returns over 90 days (as decimals, e.g., 0.01 for 1%)
   * @param {number} riskFreeRate - Annual risk-free rate (default 5% = 0.05)
   * @returns {Promise<Object>} Sharpe ratio calculation
   */
  async calculateSharpeRatio(positions, historicalReturns, riskFreeRate = 0.05) {
    if (!this.priceOracle) {
      throw new Error('Price Oracle not configured. Call setIntegrations() first.');
    }

    // Handle edge cases
    if (!positions || positions.length === 0) {
      return {
        sharpeRatio: 0,
        portfolioReturn: 0,
        volatility: 0,
        riskFreeRate,
        insufficientData: true,
        timestamp: Date.now()
      };
    }

    if (!historicalReturns || historicalReturns.length < 30) {
      return {
        sharpeRatio: 0,
        portfolioReturn: 0,
        volatility: 0,
        riskFreeRate,
        insufficientData: true,
        message: 'Insufficient historical data (minimum 30 days required)',
        timestamp: Date.now()
      };
    }

    // Calculate weighted portfolio APY
    const weightedAPY = await this.calculateWeightedAPY(positions);
    const portfolioReturn = weightedAPY.weightedAPY / 100; // Convert to decimal

    // Calculate portfolio volatility (standard deviation of returns)
    const volatility = this._calculateStandardDeviation(historicalReturns);

    // Handle zero or near-zero volatility case (threshold: 0.0001 or 0.01%)
    if (volatility < 0.0001) {
      return {
        sharpeRatio: portfolioReturn > riskFreeRate ? Infinity : 0,
        portfolioReturn: portfolioReturn * 100, // Convert back to percentage
        volatility: 0,
        riskFreeRate: riskFreeRate * 100,
        zeroVolatility: true,
        message: 'Zero or near-zero volatility detected',
        timestamp: Date.now()
      };
    }

    // Calculate Sharpe ratio: (return - risk_free_rate) / volatility
    const sharpeRatio = (portfolioReturn - riskFreeRate) / volatility;

    return {
      sharpeRatio,
      portfolioReturn: portfolioReturn * 100, // Convert to percentage for display
      volatility: volatility * 100, // Convert to percentage for display
      riskFreeRate: riskFreeRate * 100, // Convert to percentage for display
      excessReturn: (portfolioReturn - riskFreeRate) * 100,
      dataPoints: historicalReturns.length,
      insufficientData: false,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate standard deviation of returns
   * 
   * @private
   * @param {Array} returns - Array of returns (as decimals)
   * @returns {number} Standard deviation
   */
  _calculateStandardDeviation(returns) {
    if (!returns || returns.length === 0) {
      return 0;
    }

    // Calculate mean
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Calculate variance
    const squaredDifferences = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDifferences.reduce((sum, sq) => sum + sq, 0) / returns.length;

    // Return standard deviation (annualized from daily returns)
    // Annualization factor: sqrt(365) for daily returns
    const dailyStdDev = Math.sqrt(variance);
    const annualizedStdDev = dailyStdDev * Math.sqrt(365);

    return annualizedStdDev;
  }

  /**
   * Calculate expected return for a yield opportunity including all components
   * 
   * Requirements: 7.1, 7.6
   * 
   * @param {Object} opportunity - Yield opportunity object
   * @param {number} opportunity.baseAPY - Base APY from lending/staking
   * @param {Array} opportunity.incentives - Array of token incentive objects (optional)
   * @param {number} opportunity.compoundingFrequency - Compounds per year (default: 365 for daily)
   * @returns {Object} Expected return breakdown
   */
  calculateExpectedReturn(opportunity) {
    const {
      baseAPY = 0,
      incentives = [],
      compoundingFrequency = 365
    } = opportunity;

    // Calculate compounded APY from base APY
    const compoundedAPY = this._calculateCompoundedAPY(baseAPY, compoundingFrequency);

    // Calculate total incentive APY from token rewards
    let totalIncentiveAPY = 0;
    const incentiveBreakdown = [];

    for (const incentive of incentives) {
      const incentiveAPY = this._calculateIncentiveAPY(incentive);
      totalIncentiveAPY += incentiveAPY;
      
      incentiveBreakdown.push({
        token: incentive.token,
        apy: incentiveAPY,
        emissionRate: incentive.emissionRate,
        tokenPrice: incentive.tokenPrice
      });
    }

    // Total expected return = compounded base APY + incentives
    const totalAPY = compoundedAPY + totalIncentiveAPY;

    return {
      totalAPY,
      baseAPY,
      compoundedAPY,
      incentiveAPY: totalIncentiveAPY,
      incentiveBreakdown,
      compoundingFrequency,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate compounded APY accounting for compounding frequency
   * 
   * Formula: APY = (1 + r/n)^n - 1
   * where r = nominal rate, n = compounding frequency
   * 
   * @private
   * @param {number} nominalAPY - Nominal APY (as percentage, e.g., 5 for 5%)
   * @param {number} frequency - Compounding frequency per year
   * @returns {number} Compounded APY (as percentage)
   */
  _calculateCompoundedAPY(nominalAPY, frequency) {
    if (nominalAPY <= 0 || frequency <= 0) {
      return 0;
    }

    // Convert percentage to decimal
    const rate = nominalAPY / 100;

    // Calculate compounded rate: (1 + r/n)^n - 1
    const compoundedRate = Math.pow(1 + rate / frequency, frequency) - 1;

    // Convert back to percentage
    return compoundedRate * 100;
  }

  /**
   * Calculate APY from token incentives/rewards
   * 
   * Formula: Incentive APY = (emission_rate * token_price * seconds_per_year) / pool_liquidity * 100
   * 
   * @private
   * @param {Object} incentive - Incentive object
   * @param {string} incentive.token - Token symbol (e.g., 'COMP', 'AAVE')
   * @param {number} incentive.emissionRate - Tokens emitted per second
   * @param {number} incentive.tokenPrice - Token price in USD
   * @param {number} incentive.poolLiquidity - Total pool liquidity in USD
   * @returns {number} Incentive APY (as percentage)
   */
  _calculateIncentiveAPY(incentive) {
    const {
      emissionRate = 0,
      tokenPrice = 0,
      poolLiquidity = 0
    } = incentive;

    if (emissionRate <= 0 || tokenPrice <= 0 || poolLiquidity <= 0) {
      return 0;
    }

    // Calculate annual emission value in USD
    const secondsPerYear = 365 * 24 * 60 * 60;
    const annualEmissionValue = emissionRate * tokenPrice * secondsPerYear;

    // Calculate APY as percentage of pool liquidity
    const incentiveAPY = (annualEmissionValue / poolLiquidity) * 100;

    return incentiveAPY;
  }

  /**
   * Calculate expected returns for multiple yield opportunities
   * 
   * Requirements: 7.1, 7.6
   * 
   * @param {Array} opportunities - Array of yield opportunity objects
   * @returns {Array} Array of expected return calculations
   */
  calculateExpectedReturns(opportunities) {
    if (!opportunities || opportunities.length === 0) {
      return [];
    }

    return opportunities.map(opp => ({
      protocol: opp.protocol,
      asset: opp.asset,
      ...this.calculateExpectedReturn(opp)
    }));
  }

  /**
   * Calculate portfolio expected return with all positions
   * 
   * Requirements: 7.1, 7.6
   * 
   * @param {Array} positions - Array of position objects with yield data
   * @returns {Promise<Object>} Portfolio expected return breakdown
   */
  async calculatePortfolioExpectedReturn(positions) {
    if (!this.priceOracle) {
      throw new Error('Price Oracle not configured. Call setIntegrations() first.');
    }

    if (!positions || positions.length === 0) {
      return {
        totalExpectedAPY: 0,
        weightedBaseAPY: 0,
        weightedIncentiveAPY: 0,
        totalValueUSD: 0,
        positionReturns: [],
        timestamp: Date.now()
      };
    }

    // Calculate portfolio value first
    const portfolioValue = await this.calculatePortfolioValue(positions);

    // Calculate expected return for each position
    let weightedBaseAPYSum = 0;
    let weightedIncentiveAPYSum = 0;
    const positionReturns = [];

    for (const positionValue of portfolioValue.positionValues) {
      // Skip borrowed positions
      if (positionValue.type === 'borrowed') {
        continue;
      }

      // Find corresponding position with yield data
      const position = positions.find(
        p => p.protocol === positionValue.protocol && p.asset === positionValue.asset
      );

      if (!position) {
        continue;
      }

      // Calculate expected return for this position
      const expectedReturn = this.calculateExpectedReturn({
        baseAPY: position.baseAPY || position.apy || 0,
        incentives: position.incentives || [],
        compoundingFrequency: position.compoundingFrequency || 365
      });

      // Calculate weight in portfolio
      const weight = positionValue.valueUSD / portfolioValue.totalSuppliedUSD;

      // Add weighted contributions
      weightedBaseAPYSum += weight * expectedReturn.compoundedAPY;
      weightedIncentiveAPYSum += weight * expectedReturn.incentiveAPY;

      positionReturns.push({
        protocol: positionValue.protocol,
        asset: positionValue.asset,
        valueUSD: positionValue.valueUSD,
        weight: weight * 100, // Convert to percentage
        ...expectedReturn
      });
    }

    const totalExpectedAPY = weightedBaseAPYSum + weightedIncentiveAPYSum;

    return {
      totalExpectedAPY,
      weightedBaseAPY: weightedBaseAPYSum,
      weightedIncentiveAPY: weightedIncentiveAPYSum,
      totalValueUSD: portfolioValue.totalSuppliedUSD,
      positionReturns,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate compounding effect over time
   * 
   * @param {number} principal - Initial principal amount
   * @param {number} apy - Annual percentage yield (as percentage)
   * @param {number} days - Number of days to compound
   * @param {number} compoundingFrequency - Compounds per year (default: 365)
   * @returns {Object} Compounding calculation
   */
  calculateCompoundingEffect(principal, apy, days, compoundingFrequency = 365) {
    if (principal <= 0 || apy <= 0 || days <= 0) {
      return {
        principal,
        finalValue: principal,
        totalGain: 0,
        effectiveAPY: 0,
        days,
        compoundingFrequency
      };
    }

    // Convert APY to decimal
    const rate = apy / 100;

    // Calculate number of compounding periods
    const periods = (days / 365) * compoundingFrequency;

    // Calculate final value: P * (1 + r/n)^(n*t)
    const finalValue = principal * Math.pow(1 + rate / compoundingFrequency, periods);

    // Calculate total gain
    const totalGain = finalValue - principal;

    // Calculate effective APY over the period
    const effectiveAPY = ((finalValue / principal) - 1) * (365 / days) * 100;

    return {
      principal,
      finalValue,
      totalGain,
      effectiveAPY,
      days,
      compoundingFrequency,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate optimal leverage ratio for a position
   * 
   * Requirements: 7.5, 12.2, 12.6
   * 
   * @param {Object} params - Leverage calculation parameters
   * @param {number} params.supplyAPY - Supply APY (as percentage, e.g., 5 for 5%)
   * @param {number} params.borrowAPY - Borrow APY (as percentage, e.g., 3 for 3%)
   * @param {number} params.maxLeverage - Maximum allowed leverage (e.g., 3 for 3x)
   * @param {number} params.targetHealthFactor - Target health factor (default: 2.0)
   * @param {number} params.minHealthFactor - Minimum health factor (default: 1.8)
   * @param {number} params.liquidationThreshold - Liquidation threshold (default: 0.85)
   * @param {number} params.collateralPrice - Current collateral price (optional, for liquidation calc)
   * @returns {Object} Optimal leverage analysis
   */
  calculateOptimalLeverage(params) {
    const {
      supplyAPY,
      borrowAPY,
      maxLeverage = 3.0,
      targetHealthFactor = 2.0,
      minHealthFactor = 1.8,
      liquidationThreshold = 0.85,
      collateralPrice = null
    } = params;

    // Validate inputs
    if (supplyAPY === undefined || borrowAPY === undefined) {
      throw new Error('supplyAPY and borrowAPY are required');
    }

    if (maxLeverage < 1.0) {
      throw new Error('maxLeverage must be >= 1.0');
    }

    if (targetHealthFactor < minHealthFactor) {
      throw new Error('targetHealthFactor must be >= minHealthFactor');
    }

    // Calculate spread (supply APY - borrow APY)
    const spread = supplyAPY - borrowAPY;

    // Only use leverage when spread is positive
    if (spread <= 0) {
      return {
        optimalLeverage: 1.0,
        leveragedAPY: supplyAPY,
        baseAPY: supplyAPY,
        borrowAPY,
        spread,
        apyImprovement: 0,
        recommendation: 'no_leverage',
        reason: 'Negative or zero spread - borrowing costs exceed supply returns',
        healthFactor: Infinity,
        liquidationPrice: null,
        liquidationPriceDropPercentage: null,
        riskLevel: 'none',
        timestamp: Date.now()
      };
    }

    // Calculate max leverage based on target health factor
    // Health Factor = (Collateral * Liquidation Threshold) / Borrowed
    // For leverage L: Borrowed = Collateral * (L - 1)
    // HF = (Collateral * LT) / (Collateral * (L - 1))
    // HF = LT / (L - 1)
    // L = (LT / HF) + 1
    const maxLeverageByTargetHealth = (liquidationThreshold / targetHealthFactor) + 1;
    const maxLeverageByMinHealth = (liquidationThreshold / minHealthFactor) + 1;

    // Take minimum of user max and health factor constraints
    const safeLeverage = Math.min(maxLeverage, maxLeverageByTargetHealth);

    // Ensure we don't exceed minimum health factor
    const absoluteMaxLeverage = Math.min(safeLeverage, maxLeverageByMinHealth);

    // Calculate leveraged APY for optimal leverage
    // Formula: Leveraged APY = (Supply APY × Leverage) - (Borrow APY × (Leverage - 1))
    // Simplified: Leveraged APY = Supply APY + (Leverage - 1) × (Supply APY - Borrow APY)
    const leveragedAPY = supplyAPY + (absoluteMaxLeverage - 1) * spread;

    // Calculate health factor at optimal leverage
    const healthFactor = liquidationThreshold / (absoluteMaxLeverage - 1);

    // Calculate liquidation price if collateral price provided
    let liquidationPrice = null;
    let liquidationPriceDropPercentage = null;
    
    if (collateralPrice !== null && absoluteMaxLeverage > 1.0) {
      // Liquidation occurs when: (Collateral Value * LT) / Borrowed Value = 1
      // At leverage L: Borrowed = Collateral * (L - 1)
      // Liquidation price = Current Price * (L - 1) / (L * LT)
      liquidationPrice = collateralPrice * (absoluteMaxLeverage - 1) / (absoluteMaxLeverage * liquidationThreshold);
      liquidationPriceDropPercentage = ((collateralPrice - liquidationPrice) / collateralPrice) * 100;
    }

    // Determine risk level based on health factor
    let riskLevel;
    if (healthFactor >= 2.5) {
      riskLevel = 'low';
    } else if (healthFactor >= 2.0) {
      riskLevel = 'medium';
    } else if (healthFactor >= 1.8) {
      riskLevel = 'high';
    } else {
      riskLevel = 'critical';
    }

    // Generate recommendation
    let recommendation;
    let reason;

    if (absoluteMaxLeverage <= 1.0) {
      recommendation = 'no_leverage';
      reason = 'Health factor constraints prevent safe leverage';
    } else if (spread < 1.0) {
      recommendation = 'low_leverage';
      reason = 'Small spread - use conservative leverage';
    } else if (spread >= 3.0 && healthFactor >= 2.0) {
      recommendation = 'optimal_leverage';
      reason = 'Good spread and safe health factor - leverage recommended';
    } else if (spread >= 1.0 && healthFactor >= 1.8) {
      recommendation = 'moderate_leverage';
      reason = 'Moderate spread - use leverage cautiously';
    } else {
      recommendation = 'low_leverage';
      reason = 'Limited spread or health factor constraints';
    }

    return {
      optimalLeverage: absoluteMaxLeverage,
      leveragedAPY,
      baseAPY: supplyAPY,
      borrowAPY,
      spread,
      apyImprovement: leveragedAPY - supplyAPY,
      healthFactor,
      targetHealthFactor,
      minHealthFactor,
      liquidationThreshold,
      liquidationPrice,
      liquidationPriceDropPercentage,
      riskLevel,
      recommendation,
      reason,
      maxLeverageByUser: maxLeverage,
      maxLeverageByTargetHealth,
      maxLeverageByMinHealth,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate leveraged APY for a given leverage ratio
   * 
   * Requirements: 12.6
   * 
   * @param {number} supplyAPY - Supply APY (as percentage)
   * @param {number} borrowAPY - Borrow APY (as percentage)
   * @param {number} leverage - Leverage ratio (e.g., 2 for 2x)
   * @returns {Object} Leveraged APY calculation
   */
  calculateLeveragedAPY(supplyAPY, borrowAPY, leverage) {
    if (leverage < 1.0) {
      throw new Error('Leverage must be >= 1.0');
    }

    // Formula: Leveraged APY = (Supply APY × Leverage) - (Borrow APY × (Leverage - 1))
    const leveragedAPY = (supplyAPY * leverage) - (borrowAPY * (leverage - 1));
    const spread = supplyAPY - borrowAPY;
    const apyImprovement = leveragedAPY - supplyAPY;

    return {
      leveragedAPY,
      baseAPY: supplyAPY,
      borrowAPY,
      leverage,
      spread,
      apyImprovement,
      isProfitable: leveragedAPY > supplyAPY,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate liquidation price for a leveraged position
   * 
   * Requirements: 12.5
   * 
   * @param {Object} params - Liquidation calculation parameters
   * @param {number} params.collateralAmount - Amount of collateral
   * @param {number} params.collateralPrice - Current collateral price
   * @param {number} params.borrowedAmount - Amount borrowed (in same units as collateral value)
   * @param {number} params.liquidationThreshold - Liquidation threshold (e.g., 0.85)
   * @returns {Object} Liquidation price analysis
   */
  calculateLiquidationPrice(params) {
    const {
      collateralAmount,
      collateralPrice,
      borrowedAmount,
      liquidationThreshold = 0.85
    } = params;

    if (!collateralAmount || !collateralPrice || !borrowedAmount) {
      throw new Error('collateralAmount, collateralPrice, and borrowedAmount are required');
    }

    const collateralValue = collateralAmount * collateralPrice;

    // Calculate current health factor
    const currentHealthFactor = (collateralValue * liquidationThreshold) / borrowedAmount;

    // Calculate liquidation price
    // At liquidation: (Collateral Amount × Liquidation Price × LT) = Borrowed Amount
    // Liquidation Price = Borrowed Amount / (Collateral Amount × LT)
    const liquidationPrice = borrowedAmount / (collateralAmount * liquidationThreshold);

    // Calculate price drop percentage to liquidation
    const priceDropToLiquidation = collateralPrice - liquidationPrice;
    const priceDropPercentage = (priceDropToLiquidation / collateralPrice) * 100;

    // Calculate leverage ratio
    const leverage = collateralValue / (collateralValue - borrowedAmount);

    return {
      liquidationPrice,
      currentPrice: collateralPrice,
      priceDropToLiquidation,
      priceDropPercentage,
      healthFactor: currentHealthFactor,
      leverage,
      collateralValue,
      borrowedAmount,
      liquidationThreshold,
      isAtRisk: currentHealthFactor < 1.5,
      timestamp: Date.now()
    };
  }

  /**
   * Analyze multiple leverage scenarios
   * 
   * Requirements: 7.5, 12.2
   * 
   * @param {Object} params - Base parameters
   * @param {Array} leverageRatios - Array of leverage ratios to analyze
   * @returns {Array} Array of leverage scenario analyses
   */
  analyzeLeverageScenarios(params, leverageRatios = [1.0, 1.5, 2.0, 2.5, 3.0]) {
    const scenarios = [];

    for (const leverage of leverageRatios) {
      // Calculate leveraged APY
      const apyResult = this.calculateLeveragedAPY(
        params.supplyAPY,
        params.borrowAPY,
        leverage
      );

      // Calculate health factor
      const liquidationThreshold = params.liquidationThreshold || 0.85;
      const healthFactor = leverage > 1.0 
        ? liquidationThreshold / (leverage - 1)
        : Infinity;

      // Calculate liquidation price if collateral price provided
      let liquidationPrice = null;
      let priceDropPercentage = null;
      
      if (params.collateralPrice && leverage > 1.0) {
        liquidationPrice = params.collateralPrice * (leverage - 1) / (leverage * liquidationThreshold);
        priceDropPercentage = ((params.collateralPrice - liquidationPrice) / params.collateralPrice) * 100;
      }

      // Determine if this scenario is safe
      const minHealthFactor = params.minHealthFactor || 1.8;
      const isSafe = healthFactor >= minHealthFactor;

      scenarios.push({
        leverage,
        ...apyResult,
        healthFactor,
        liquidationPrice,
        priceDropPercentage,
        isSafe,
        riskLevel: healthFactor >= 2.5 ? 'low' : 
                   healthFactor >= 2.0 ? 'medium' : 
                   healthFactor >= 1.8 ? 'high' : 'critical'
      });
    }

    return scenarios;
  }
}
