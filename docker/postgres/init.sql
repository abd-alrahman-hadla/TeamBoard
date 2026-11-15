-- Runs once, when the Postgres volume is first created.
-- teamboard       : dev database (created by POSTGRES_DB)
-- teamboard_test  : Jest integration tests (truncated between tests)
-- teamboard_e2e   : Playwright end-to-end tests (reset before each run)
CREATE DATABASE teamboard_test OWNER teamboard;
CREATE DATABASE teamboard_e2e OWNER teamboard;
