import { Filter, FilterResult } from './pool-filters';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../helpers';

export class HolderFilter implements Filter {
  constructor(
    private readonly connection: Connection,
    private readonly maxTopHolderPercent: number = 5,
    private readonly minHolderCount: number = 150,
  ) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
      // Get all token accounts for the base token
      const accounts = await this.connection.getProgramAccounts(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // Token program ID
        {
          filters: [
            {
              dataSize: 165, // Token account size
            },
            {
              memcmp: {
                offset: 0,
                bytes: poolKeys.baseMint.toBase58(),
              },
            },
          ],
        }
      );

      // Count total holders
      const holderCount = accounts.length;
      if (holderCount < this.minHolderCount) {
        return {
          ok: false,
          message: `Holder -> Insufficient holders: ${holderCount} < ${this.minHolderCount}`,
        };
      }

      // Calculate total supply and find largest holder
      let totalSupply = BigInt(0);
      let largestHolding = BigInt(0);

      for (const account of accounts) {
        const amount = BigInt(account.account.data.slice(64, 72).readBigUInt64LE());
        totalSupply += amount;
        if (amount > largestHolding) {
          largestHolding = amount;
        }
      }

      // Calculate percentage of largest holder
      if (totalSupply > BigInt(0)) {
        const topHolderPercent = Number((largestHolding * BigInt(100)) / totalSupply);
        if (topHolderPercent > this.maxTopHolderPercent) {
          return {
            ok: false,
            message: `Holder -> Top holder owns too much: ${topHolderPercent}% > ${this.maxTopHolderPercent}%`,
          };
        }
      }

      // Everything is good - enough holders and no single large holder
      return {
        ok: true,
        message: `Holder -> Passed checks: ${holderCount} holders, Top holder: ${
          totalSupply > BigInt(0)
            ? Number((largestHolding * BigInt(100)) / totalSupply)
            : 0
        }%`,
      };
    } catch (error) {
      logger.error({ mint: poolKeys.baseMint }, `Failed to check holders`);
      return { ok: false, message: 'Holder -> Failed to check holders' };
    }
  }
}