import { Connection, PublicKey } from '@solana/web3.js';
import { LiquidityPoolKeysV4, Token, TokenAmount, Liquidity, MAINNET_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { struct, publicKey } from '@raydium-io/raydium-sdk';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { BurnFilter } from './filters/burn.filter';
import { RenouncedFreezeFilter } from './filters/renounced.filter';
import { MutableFilter } from './filters/mutable.filter';
import { PoolSizeFilter } from './filters/pool-size.filter';
import { HolderFilter } from './filters/holder.filter';
import { logger } from './helpers';

// Market layout helper
const MINIMAL_MARKET_STATE_LAYOUT_V3 = struct([publicKey('eventQueue'), publicKey('bids'), publicKey('asks')]);

async function getMinimalMarketInfo(connection: Connection, marketId: PublicKey) {
  console.log('Getting market info for:', marketId.toBase58());
  const marketInfo = await connection.getAccountInfo(marketId);
  if (!marketInfo?.data) {
    throw new Error('Failed to get market info');
  }
  return MINIMAL_MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);
}

interface DetailedFilterResult {
  name: string;
  passed: boolean;
  details: {
    message: string;
    [key: string]: any;
  };
}

async function testFilters(
  connection: Connection,
  poolKeys: LiquidityPoolKeysV4,
  quoteToken: Token,
  minPoolSize: TokenAmount,
  maxPoolSize: TokenAmount
): Promise<DetailedFilterResult[]> {
  const results: DetailedFilterResult[] = [];

  try {
    // Test Burn Filter
    const burnFilter = new BurnFilter(connection);
    const burnResult = await burnFilter.execute(poolKeys);
    results.push({
      name: 'Burn Filter',
      passed: burnResult.ok,
      details: {
        lpBurned: burnResult.ok,
        message: burnResult.message || 'No message provided'
      }
    });

    // Test Renounced/Freeze Filter
    const renouncedFilter = new RenouncedFreezeFilter(connection, true, true);
    const renouncedResult = await renouncedFilter.execute(poolKeys);
    results.push({
      name: 'Renounced/Freeze Filter',
      passed: renouncedResult.ok,
      details: {
        passed: renouncedResult.ok,
        message: renouncedResult.message || 'No message provided'
      }
    });

    // Test Mutable Filter
    const mutableFilter = new MutableFilter(connection, getMetadataAccountDataSerializer(), true, true);
    const mutableResult = await mutableFilter.execute(poolKeys);
    results.push({
      name: 'Mutable/Socials Filter',
      passed: mutableResult.ok,
      details: {
        passed: mutableResult.ok,
        message: mutableResult.message || 'No message provided'
      }
    });

    // Test Pool Size Filter
    const poolSizeFilter = new PoolSizeFilter(connection, quoteToken, minPoolSize, maxPoolSize);
    const poolSizeResult = await poolSizeFilter.execute(poolKeys);
    results.push({
      name: 'Pool Size Filter',
      passed: poolSizeResult.ok,
      details: {
        passed: poolSizeResult.ok,
        message: poolSizeResult.message || 'No message provided'
      }
    });

    // Test Holder Filter
    const holderFilter = new HolderFilter(connection);
    const holderResult = await holderFilter.execute(poolKeys);
    results.push({
      name: 'Holder Filter',
      passed: holderResult.ok,
      details: {
        passed: holderResult.ok,
        message: holderResult.message || 'No message provided'
      }
    });
  } catch (error) {
    console.error('Error in testFilters:', error);
  }

  return results;
}

export async function analyzePool(
  poolId: string,
  connection: Connection,
  quoteToken: Token,
  minPoolSize: TokenAmount,
  maxPoolSize: TokenAmount
): Promise<DetailedFilterResult[]> {
  try {
    console.log('Starting pool analysis...');
    console.log('Pool ID:', poolId);
    
    // Create a connection with a shorter timeout
    const customConnection = new Connection(
      connection.rpcEndpoint,
      {
        commitment: 'confirmed',
        httpHeaders: { 'Content-Type': 'application/json' }
      }
    );
    
    console.log('Fetching pool info...');
    
    // Create pool pubkey
    const poolPubkey = new PublicKey(poolId);
    
    // Get pools with version filter to reduce data
    const pools = await Liquidity.fetchAllPoolKeys(
      customConnection,
      {
        4: MAINNET_PROGRAM_ID.AmmV4,
        5: MAINNET_PROGRAM_ID.AmmV4  // Use V4 for both since we're only interested in V4 pools
      }
    );
    
    // Find the specific pool
    const pool = pools.find(p => p.id.equals(poolPubkey));
    
    if (!pool) {
      throw new Error('Pool not found or invalid');
    }
    
    console.log('Pool found, fetching market data...');
    console.log('Market ID:', pool.marketId.toBase58());
    
    // Get market data with retry mechanism
    let marketInfo;
    try {
      marketInfo = await getMinimalMarketInfo(customConnection, pool.marketId);
    } catch (error) {
      console.log('First attempt failed, retrying market info fetch in 2 seconds...');
      console.error('Error:', error);
      await new Promise(resolve => setTimeout(resolve, 2000));
      marketInfo = await getMinimalMarketInfo(customConnection, pool.marketId);
    }
    
    console.log('Market info fetched successfully');
    
    // Create pool keys with real data
    const poolKeys: LiquidityPoolKeysV4 = {
      ...pool,
      marketBids: marketInfo.bids,
      marketAsks: marketInfo.asks,
      marketEventQueue: marketInfo.eventQueue
    };

    console.log('Running filters...');
    const results = await testFilters(customConnection, poolKeys, quoteToken, minPoolSize, maxPoolSize);
    
    console.log('\nFilter Analysis Results:');
    console.log('=======================');
    
    results.forEach(result => {
      console.log(`\n${result.name}:`);
      console.log(`Passed: ${result.passed}`);
      console.log('Details:', result.details);
    });

    return results;
  } catch (error) {
    logger.error('Error analyzing pool:', error);
    throw error;
  }
}