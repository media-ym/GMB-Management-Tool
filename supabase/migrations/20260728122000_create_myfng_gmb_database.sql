-- Run this ONCE in Supabase Studio → SQL Editor (connected to default `postgres` DB).
-- Creates an isolated database for MyFNG GMB Management.
-- Future apps: CREATE DATABASE myfng; / CREATE DATABASE myfng_xyz;

SELECT 'Create database myfng_gmb from the steps below if it does not exist'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'myfng_gmb');

-- NOTE: CREATE DATABASE cannot run inside a transaction block in some Studio setups.
-- If the statement below fails in SQL Editor, run it alone as a single query:
--   CREATE DATABASE myfng_gmb;
