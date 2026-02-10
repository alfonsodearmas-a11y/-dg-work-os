/**
 * Seed DG User Script
 *
 * Upserts the DG (Director General) user into the PostgreSQL users table.
 * This script is idempotent - it can be run multiple times safely.
 *
 * Requirements:
 * - DATABASE_URL env var (PostgreSQL connection string)
 * - DG_INITIAL_PASSWORD env var (required, will be hashed with bcrypt)
 *
 * Optional:
 * - DG_EMAIL env var (defaults to 'dg@mopua.gov.gy')
 *
 * Usage:
 *   npx tsx scripts/seed-dg-user.ts
 */

// @ts-expect-error — dotenv has no type declarations in this project
import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const DG_EMAIL = process.env.DG_EMAIL || 'dg@mopua.gov.gy';
const DG_INITIAL_PASSWORD = process.env.DG_INITIAL_PASSWORD;

// Validate required environment variables
if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  console.error('   Please set DATABASE_URL in your .env.local file');
  process.exit(1);
}

if (!DG_INITIAL_PASSWORD) {
  console.error('❌ ERROR: DG_INITIAL_PASSWORD environment variable is required');
  console.error('   Please set DG_INITIAL_PASSWORD in your .env.local file');
  console.error('   Example: DG_INITIAL_PASSWORD=YourSecurePasswordHere');
  process.exit(1);
}

// Create database pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function seedDGUser() {
  const client = await pool.connect();

  try {
    console.log('🔐 Seeding DG User...\n');

    // Hash the password
    console.log('   Hashing password...');
    const passwordHash = await bcrypt.hash(DG_INITIAL_PASSWORD as string, 10);

    // Upsert the DG user
    console.log('   Upserting user record...');
    const result = await client.query(
      `
      INSERT INTO users (
        username,
        email,
        password_hash,
        full_name,
        role,
        agency,
        is_active,
        must_change_password
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      )
      ON CONFLICT (username)
      DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        agency = EXCLUDED.agency,
        is_active = EXCLUDED.is_active,
        must_change_password = EXCLUDED.must_change_password,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, username, email, full_name, role, agency, is_active, must_change_password, created_at, updated_at
      `,
      [
        'dg',                      // username
        DG_EMAIL,                  // email
        passwordHash,              // password_hash
        'Alfonso De Armas',        // full_name
        'director',                // role
        'ministry',                // agency
        true,                      // is_active
        false,                     // must_change_password
      ]
    );

    const user = result.rows[0];

    console.log('\n✅ DG User seeded successfully!\n');
    console.log('   User Details:');
    console.log('   ─────────────────────────────────────────────────────');
    console.log(`   ID:                    ${user.id}`);
    console.log(`   Username:              ${user.username}`);
    console.log(`   Email:                 ${user.email}`);
    console.log(`   Full Name:             ${user.full_name}`);
    console.log(`   Role:                  ${user.role}`);
    console.log(`   Agency:                ${user.agency}`);
    console.log(`   Active:                ${user.is_active}`);
    console.log(`   Must Change Password:  ${user.must_change_password}`);
    console.log(`   Created At:            ${user.created_at}`);
    console.log(`   Updated At:            ${user.updated_at}`);
    console.log('   ─────────────────────────────────────────────────────\n');

  } catch (error: any) {
    console.error('❌ Error seeding DG user:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await seedDGUser();
    await pool.end();
    console.log('🎉 Done!\n');
    process.exit(0);
  } catch (error) {
    await pool.end();
    process.exit(1);
  }
}

main();
