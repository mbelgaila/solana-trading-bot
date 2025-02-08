import { Connection, PublicKey } from '@solana/web3.js';
import { Token, TokenAmount, Liquidity, MAINNET_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { analyzePool } from './test-filters';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { logger } from './helpers';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment variables
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://mainnet.helius-rpc.com/?api-key=7573840f-3a0f-4f20-82ba-857d3550edc0';
const COMMITMENT_LEVEL = process.env.COMMITMENT_LEVEL || 'confirmed';
const MIN_POOL_SIZE = Number(process.env.MIN_POOL_SIZE || '20');
const MAX_POOL_SIZE = Number(process.env.MAX_POOL_SIZE || '300');

if (!RPC_ENDPOINT) {
    console.error('RPC_ENDPOINT is required in .env file');
    process.exit(1);
}

// Setup connection with retry mechanism
async function createConnection(): Promise<Connection> {
    const connection = new Connection(RPC_ENDPOINT, {
        commitment: COMMITMENT_LEVEL as 'confirmed' | 'processed' | 'finalized',
        confirmTransactionInitialTimeout: 60000
    });

    // Test connection
    try {
        console.log('Testing connection...');
        const blockHeight = await connection.getBlockHeight();
        console.log('Connection successful. Current block height:', blockHeight);
        return connection;
    } catch (error) {
        console.error('Failed to connect to RPC:', error);
        throw error;
    }
}

// Setup quote token (SOL)
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const quoteToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(WSOL_MINT), 9, 'WSOL', 'WSOL');

// Setup pool size limits
const minPoolSize = new TokenAmount(quoteToken, MIN_POOL_SIZE, false);
const maxPoolSize = new TokenAmount(quoteToken, MAX_POOL_SIZE, false);

async function listPools(connection: Connection) {
    try {
        console.log('Fetching pools...');
        console.log('This may take a few moments...');
        
        const pools = await Liquidity.fetchAllPoolKeys(
            connection,
            { 4: MAINNET_PROGRAM_ID.AmmV4, 5: MAINNET_PROGRAM_ID.AmmV4 }
        );
        
        console.log(`\nFound ${pools.length} pools`);
        console.log('\nShowing first 5 pools:');
        console.log('======================');
        
        pools.slice(0, 5).forEach((pool, index) => {
            console.log(`\n${index + 1}. Pool ID: ${pool.id.toBase58()}`);
            console.log(`   Base Token: ${pool.baseMint.toBase58()}`);
            console.log(`   Quote Token: ${pool.quoteMint.toBase58()}`);
            console.log('   ---');
        });
        
        console.log(`\n... and ${pools.length - 5} more pools`);
    } catch (error) {
        console.error('Error fetching pools:', error);
        if (error instanceof Error) {
            console.error('Error details:', error.message);
            console.error('Stack trace:', error.stack);
        }
        throw error;
    }
}

async function main() {
    try {
        console.log('Starting application...');
        
        // Initialize connection
        const connection = await createConnection();
        
        // Check command line arguments
        const command = process.argv[2];
        const poolId = process.argv[3];

        console.log('Command:', command);
        if (poolId) console.log('Pool ID:', poolId);

        if (!command) {
            console.error('Please provide a command: list or analyze');
            console.error('Usage:');
            console.error('  To list pools: ts-node index-test.ts list');
            console.error('  To analyze a pool: ts-node index-test.ts analyze <pool-id>');
            process.exit(1);
        }

        if (command === 'list') {
            console.log('Executing list command...');
            await listPools(connection);
            return;
        }

        if (command === 'analyze') {
            if (!poolId) {
                console.error('Please provide a pool ID to analyze');
                console.error('Usage: ts-node index-test.ts analyze <pool-id>');
                process.exit(1);
            }

            try {
                // Validate pool ID
                new PublicKey(poolId);
            } catch (e) {
                console.error('Invalid pool ID');
                process.exit(1);
            }

            console.log(`\nAnalyzing pool: ${poolId}`);
            console.log('=====================================');

            try {
                const results = await analyzePool(
                    poolId,
                    connection,
                    quoteToken,
                    minPoolSize,
                    maxPoolSize
                );

                console.log('\nSummary:');
                console.log('========');
                const allPassed = results.every((r: any) => r.passed);
                console.log(`Overall Status: ${allPassed ? 'All filters passed ✅' : 'Some filters failed ❌'}`);
                
                if (!allPassed) {
                    console.log('\nFailed Filters:');
                    results.filter((r: any) => !r.passed).forEach((result: any) => {
                        console.log(`- ${result.name}: ${result.details.message}`);
                    });
                }
            } catch (error) {
                console.error('Error analyzing pool:', error);
                throw error;
            }
        } else {
            console.error('Unknown command. Use "list" or "analyze"');
            process.exit(1);
        }
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

main().catch((error) => {
    console.error('Error in main:', error);
    process.exit(1);
});