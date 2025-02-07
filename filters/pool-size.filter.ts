import { Filter, FilterResult } from './pool-filters';
import { LiquidityPoolKeysV4, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { Connection } from '@solana/web3.js';
import { logger } from '../helpers';

export class PoolSizeFilter implements Filter {
  constructor(
    private readonly connection: Connection,
    private readonly quoteToken: Token,
    private readonly minPoolSize: TokenAmount,
    private readonly maxPoolSize: TokenAmount,
  ) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
        const response = await this.connection.getTokenAccountBalance(poolKeys.quoteVault, this.connection.commitment);
        const poolSize = new TokenAmount(this.quoteToken, response.value.amount, true);

        // Get decimal values for comparison
        const poolSizeDecimal = parseFloat(poolSize.toFixed());
        const maxSizeDecimal = parseFloat(this.maxPoolSize.toFixed());
        const minSizeDecimal = parseFloat(this.minPoolSize.toFixed());

        // Check if pool size is outside the desired range
        if (poolSizeDecimal > maxSizeDecimal) {
            return { ok: true, message: `PoolSize -> Pool size ${poolSizeDecimal} > ${maxSizeDecimal}` };
        }

        if (poolSizeDecimal < minSizeDecimal) {
            return { ok: true, message: `PoolSize -> Pool size ${poolSizeDecimal} < ${minSizeDecimal}` };
        }

        // If we get here, the pool size is within range (between min and max)
        return { ok: false, message: `PoolSize -> Pool size ${poolSizeDecimal}` };
    } catch (error) {
        logger.error({ mint: poolKeys.baseMint }, `Failed to check pool size`);
        return { ok: false, message: 'PoolSize -> Failed to check pool size' };
    }
  } 
}
