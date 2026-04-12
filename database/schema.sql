-- ============================================================
-- WeddingCut — Schema per RDS
-- ============================================================

USE `weddingcut`;

-- ENTITÀ: services
CREATE TABLE IF NOT EXISTS `services` (
  `id`                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `publicId`            VARCHAR(36)       DEFAULT NULL UNIQUE,
  `name`                VARCHAR(200)      NOT NULL,
  `description`         TEXT              NOT NULL,
  `durationDescription` VARCHAR(500)      DEFAULT NULL,
  `category`            ENUM('main','extra','delivery') NOT NULL DEFAULT 'main',
  `pricingType`         ENUM('fixed','tiered','percentage') NOT NULL DEFAULT 'fixed',
  `basePrice`           DECIMAL(10,2)     DEFAULT NULL,
  `percentageValue`     DECIMAL(5,2)      DEFAULT NULL,
  `priceTiers`          JSON              DEFAULT NULL,
  `restrictedToService` VARCHAR(36)       DEFAULT NULL,
  `sortOrder`           SMALLINT UNSIGNED DEFAULT NULL,
  `isActive`            TINYINT UNSIGNED  NOT NULL DEFAULT 1,
  `createdAt`           TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`           TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_services_category` (`category`),
  INDEX `idx_services_sortOrder` (`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ENTITÀ: orders
CREATE TABLE IF NOT EXISTS `orders` (
  `id`               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `publicId`         VARCHAR(36)     NOT NULL UNIQUE,
  `userEmail`        VARCHAR(320)    NOT NULL,
  `coupleName`       VARCHAR(300)    NOT NULL,
  `weddingDate`      DATE            NOT NULL,
  `deliveryMethod`   ENUM('cloud_link','upload_request') NOT NULL,
  `materialLink`     VARCHAR(1000)   DEFAULT NULL,
  `materialSizeGb`   DECIMAL(6,2)    NOT NULL,
  `cameraCount`      ENUM('1-4','5-6','7+') NOT NULL,
  `generalNotes`     TEXT            DEFAULT NULL,
  `referenceVideo`   VARCHAR(1000)   DEFAULT NULL,
  `exportFps`        VARCHAR(20)     DEFAULT NULL,
  `exportBitrate`    VARCHAR(20)     DEFAULT NULL,
  `exportAspect`     VARCHAR(20)     DEFAULT NULL,
  `exportResolution` VARCHAR(20)     DEFAULT NULL,
  `selectedServices` JSON            NOT NULL,
  `servicesTotal`    DECIMAL(10,2)   DEFAULT NULL,
  `cameraSurcharge`  DECIMAL(10,2)   NOT NULL DEFAULT 0,
  `totalPrice`       DECIMAL(10,2)   DEFAULT NULL,
  `status`           ENUM('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  `adminNotes`       TEXT            DEFAULT NULL,
  `deliveryLink`         VARCHAR(1000)   DEFAULT NULL,
  `desiredDeliveryDate`  DATE            DEFAULT NULL,
  `invoiceUrl`           VARCHAR(1000)   DEFAULT NULL,
  `createdAt`            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_orders_userEmail` (`userEmail`),
  INDEX `idx_orders_status`    (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ENTITÀ: conversations
CREATE TABLE IF NOT EXISTS `conversations` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `publicId`      VARCHAR(36)   NOT NULL UNIQUE,
  `userEmail`     VARCHAR(320)  NOT NULL,
  `subject`       VARCHAR(500)  NOT NULL,
  `orderId`       VARCHAR(36)   DEFAULT NULL,
  `status`        ENUM('open','closed') NOT NULL DEFAULT 'open',
  `chatMode`      ENUM('limited','realtime') NOT NULL DEFAULT 'limited',
  `lastMessageAt` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_conversations_userEmail` (`userEmail`),
  INDEX `idx_conversations_status`    (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ENTITÀ: messages
CREATE TABLE IF NOT EXISTS `messages` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `publicId`       VARCHAR(36)  NOT NULL UNIQUE,
  `conversationId` INT UNSIGNED NOT NULL,
  `senderRole`     ENUM('user','admin') NOT NULL,
  `senderEmail`    VARCHAR(320) NOT NULL,
  `content`        TEXT         NOT NULL,
  `readAt`         TIMESTAMP    NULL DEFAULT NULL,
  `createdAt`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_messages_conversationId` (`conversationId`),
  CONSTRAINT `fk_messages_conversation` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MIGRATION: ordini multi-matrimonio (batch orders)
-- ============================================================

-- 1. Aggiungi colonna isBatch alla tabella orders
ALTER TABLE `orders`
  ADD COLUMN IF NOT EXISTS `isBatch` TINYINT(1) NOT NULL DEFAULT 0 AFTER `userEmail`;

-- 2. Crea tabella order_entries
CREATE TABLE IF NOT EXISTS `order_entries` (
  `id`           INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `publicId`     VARCHAR(36)       NOT NULL UNIQUE,
  `orderId`      INT UNSIGNED      NOT NULL,
  `coupleName`   VARCHAR(300)      NOT NULL,
  `weddingDate`  DATE              NOT NULL,
  `status`       ENUM('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  `adminNotes`   TEXT              DEFAULT NULL,
  `deliveryLink` VARCHAR(1000)     DEFAULT NULL,
  `sortOrder`    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `createdAt`    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_order_entries_orderId` (`orderId`),
  INDEX `idx_order_entries_status`  (`status`),
  CONSTRAINT `fk_order_entries_order`
    FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Migrazione dati esistenti: crea 1 entry per ogni ordine già presente
INSERT IGNORE INTO `order_entries`
  (`publicId`, `orderId`, `coupleName`, `weddingDate`, `status`, `adminNotes`, `deliveryLink`, `sortOrder`)
SELECT
  UUID(),
  o.`id`,
  o.`coupleName`,
  o.`weddingDate`,
  o.`status`,
  o.`adminNotes`,
  o.`deliveryLink`,
  0
FROM `orders` o
WHERE o.`id` NOT IN (SELECT DISTINCT `orderId` FROM `order_entries`);

-- ============================================================
-- MIGRATION: per-entry service config (redesign creazione ordini)
-- ============================================================

-- 4. Aggiungi colonne di configurazione servizi a order_entries
ALTER TABLE `order_entries`
  ADD COLUMN IF NOT EXISTS `selectedServices` JSON                             DEFAULT NULL AFTER `deliveryLink`,
  ADD COLUMN IF NOT EXISTS `deliveryMethod`   ENUM('cloud_link','upload_request') DEFAULT NULL AFTER `selectedServices`,
  ADD COLUMN IF NOT EXISTS `materialLink`     VARCHAR(1000)                   DEFAULT NULL AFTER `deliveryMethod`,
  ADD COLUMN IF NOT EXISTS `materialSizeGb`   DECIMAL(6,2)                    DEFAULT NULL AFTER `materialLink`,
  ADD COLUMN IF NOT EXISTS `cameraCount`      ENUM('1-4','5-6','7+')          DEFAULT NULL AFTER `materialSizeGb`,
  ADD COLUMN IF NOT EXISTS `exportFps`        VARCHAR(20)                     DEFAULT NULL AFTER `cameraCount`,
  ADD COLUMN IF NOT EXISTS `exportBitrate`    VARCHAR(20)                     DEFAULT NULL AFTER `exportFps`,
  ADD COLUMN IF NOT EXISTS `exportAspect`     VARCHAR(20)                     DEFAULT NULL AFTER `exportBitrate`,
  ADD COLUMN IF NOT EXISTS `exportResolution` VARCHAR(20)                     DEFAULT NULL AFTER `exportAspect`,
  ADD COLUMN IF NOT EXISTS `servicesTotal`    DECIMAL(10,2)                   DEFAULT NULL AFTER `exportResolution`,
  ADD COLUMN IF NOT EXISTS `cameraSurcharge`  DECIMAL(10,2)                   DEFAULT NULL AFTER `servicesTotal`,
  ADD COLUMN IF NOT EXISTS `totalPrice`       DECIMAL(10,2)                   DEFAULT NULL AFTER `cameraSurcharge`;

-- 5. Copia la config servizi dall'ordine padre nelle entries già esistenti
UPDATE `order_entries` oe
JOIN `orders` o ON o.id = oe.orderId
SET oe.selectedServices = o.selectedServices,
    oe.deliveryMethod   = o.deliveryMethod,
    oe.materialLink     = o.materialLink,
    oe.materialSizeGb   = o.materialSizeGb,
    oe.cameraCount      = o.cameraCount,
    oe.exportFps        = o.exportFps,
    oe.exportBitrate    = o.exportBitrate,
    oe.exportAspect     = o.exportAspect,
    oe.exportResolution = o.exportResolution,
    oe.servicesTotal    = o.servicesTotal,
    oe.cameraSurcharge  = o.cameraSurcharge,
    oe.totalPrice       = o.totalPrice
WHERE oe.selectedServices IS NULL;

-- 6. Rendi nullable i campi order-level che ora vivono nelle entries
ALTER TABLE `orders`
  MODIFY COLUMN `deliveryMethod`  ENUM('cloud_link','upload_request') DEFAULT NULL,
  MODIFY COLUMN `materialSizeGb`  DECIMAL(6,2)  DEFAULT NULL,
  MODIFY COLUMN `cameraCount`     ENUM('1-4','5-6','7+') DEFAULT NULL,
  MODIFY COLUMN `cameraSurcharge` DECIMAL(10,2) DEFAULT NULL;

-- ============================================================
-- MIGRATION: aggiornamento tabella services (listino 2025)
-- Da eseguire su RDS se la tabella esiste già
-- ============================================================
ALTER TABLE `services`
  DROP COLUMN IF EXISTS `minDuration`,
  DROP COLUMN IF EXISTS `maxDuration`,
  DROP COLUMN IF EXISTS `orientation`,
  DROP COLUMN IF EXISTS `priceVertical`,
  DROP COLUMN IF EXISTS `priceHorizontal`,
  DROP COLUMN IF EXISTS `priceBoth`,
  DROP COLUMN IF EXISTS `additionalOptions`,
  ADD COLUMN IF NOT EXISTS `category`            ENUM('main','extra','delivery') NOT NULL DEFAULT 'main'  AFTER `durationDescription`,
  ADD COLUMN IF NOT EXISTS `pricingType`         ENUM('fixed','tiered','percentage') NOT NULL DEFAULT 'fixed' AFTER `category`,
  ADD COLUMN IF NOT EXISTS `basePrice`           DECIMAL(10,2)     DEFAULT NULL AFTER `pricingType`,
  ADD COLUMN IF NOT EXISTS `percentageValue`     DECIMAL(5,2)      DEFAULT NULL AFTER `basePrice`,
  ADD COLUMN IF NOT EXISTS `priceTiers`          JSON              DEFAULT NULL AFTER `percentageValue`,
  ADD COLUMN IF NOT EXISTS `restrictedToService` VARCHAR(36)       DEFAULT NULL AFTER `priceTiers`,
  ADD COLUMN IF NOT EXISTS `sortOrder`           SMALLINT UNSIGNED DEFAULT NULL AFTER `restrictedToService`,
  ADD COLUMN IF NOT EXISTS `isActive`            TINYINT UNSIGNED  NOT NULL DEFAULT 1 AFTER `sortOrder`;
