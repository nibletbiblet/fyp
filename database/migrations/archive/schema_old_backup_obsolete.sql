-- ARCHIVED / OBSOLETE BACKUP: do not apply.
-- This dump is the pre-rebuild schema with transactions, ledger_entries, and
-- payout_records. The approved fresh-database baseline is database/schema.sql.

-- MySQL dump 10.13  Distrib 8.0.42, for Win64 (x86_64)
--
-- Host: dft-fyp.mysql.database.azure.com    Database: soi-2026-2610-0017-yucheng
-- ------------------------------------------------------
-- Server version	8.0.44-azure

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `ledger_entries`
--

DROP TABLE IF EXISTS `ledger_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ledger_entries` (
  `entry_id` bigint NOT NULL AUTO_INCREMENT,
  `merchant_id` varchar(36) NOT NULL,
  `transaction_id` varchar(36) NOT NULL,
  `type` enum('CREDIT','DEBIT') NOT NULL,
  `amount_sgd` decimal(10,2) NOT NULL,
  `platform_fee_sgd` decimal(10,2) NOT NULL DEFAULT '0.00',
  `processed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`entry_id`),
  KEY `fk_ledger_merchants_idx` (`merchant_id`),
  KEY `fk_ledger_transactions_idx` (`transaction_id`),
  CONSTRAINT `fk_ledger_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ledger_transactions` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`transaction_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merchants`
--

DROP TABLE IF EXISTS `merchants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchants` (
  `merchant_id` varchar(36) NOT NULL,
  `company_name` varchar(255) NOT NULL,
  `uen` varchar(12) NOT NULL,
  `corporate_email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `bank_account_no` varchar(50) NOT NULL,
  `bank_name` varchar(100) NOT NULL,
  `bank_holder_name` varchar(255) NOT NULL,
  `status` enum('PENDING','ACTIVE','SUSPENDED') NOT NULL DEFAULT 'PENDING',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`merchant_id`),
  UNIQUE KEY `uen_UNIQUE` (`uen`),
  UNIQUE KEY `email_UNIQUE` (`corporate_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payout_records`
--

DROP TABLE IF EXISTS `payout_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payout_records` (
  `payout_id` varchar(36) NOT NULL,
  `merchant_id` varchar(36) NOT NULL,
  `amount_sgd` decimal(10,2) NOT NULL,
  `bank_reference_no` varchar(100) DEFAULT NULL,
  `payout_status` enum('PENDING_APPROVAL','PROCESSING','SETTLED','FAILED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payout_id`),
  KEY `fk_payouts_merchants_idx` (`merchant_id`),
  CONSTRAINT `fk_payouts_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transactions` (
  `transaction_id` varchar(36) NOT NULL,
  `merchant_id` varchar(36) NOT NULL,
  `payment_reference` varchar(50) NOT NULL,
  `triplea_order_id` varchar(100) DEFAULT NULL,
  `target_amount_sgd` decimal(10,2) NOT NULL,
  `payment_status` enum('PENDING','DETECTED','SETTLED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`transaction_id`),
  UNIQUE KEY `payment_reference` (`payment_reference`),
  KEY `fk_transactions_merchants_idx` (`merchant_id`),
  CONSTRAINT `fk_transactions_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-15 20:51:36
