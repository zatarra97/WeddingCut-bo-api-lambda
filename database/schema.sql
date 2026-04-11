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
