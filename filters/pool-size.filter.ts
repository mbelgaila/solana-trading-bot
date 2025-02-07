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

        // Vérification de la taille maximale
        if (!this.maxPoolSize?.isZero() && poolSize.raw.gt(this.maxPoolSize.raw)) {
            return { ok: false, message: `PoolSize -> Pool size ${poolSize.toFixed()} > ${this.maxPoolSize.toFixed()}` };
        }

        // Vérification de la taille minimale
        if (!this.minPoolSize?.isZero() && poolSize.raw.lt(this.minPoolSize.raw)) {
            return { ok: false, message: `PoolSize -> Pool size ${poolSize.toFixed()} < ${this.minPoolSize.toFixed()}` };
        }

        // Si on arrive ici, les deux conditions sont satisfaites
        return { ok: true };
    } catch (error) {
        logger.error({ mint: poolKeys.baseMint }, `Failed to check pool size`);
        return { ok: false, message: 'PoolSize -> Failed to check pool size' };
    }
  } 
}
