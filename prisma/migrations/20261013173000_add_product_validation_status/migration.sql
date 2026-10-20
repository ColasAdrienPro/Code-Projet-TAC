ALTER TABLE `product`
    ADD COLUMN `status` ENUM('pending', 'public') NOT NULL DEFAULT 'public',
    ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `validated_at` DATETIME(3) NULL;

ALTER TABLE `product`
    MODIFY COLUMN `status` ENUM('pending', 'public') NOT NULL DEFAULT 'pending';
