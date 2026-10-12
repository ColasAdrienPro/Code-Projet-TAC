-- AlterTable
ALTER TABLE `user`
    MODIFY `firstname` VARCHAR(255) NOT NULL,
    MODIFY `lastname` VARCHAR(255) NOT NULL,
    MODIFY `email` VARCHAR(255) NOT NULL,
    MODIFY `password` VARCHAR(255) NOT NULL,
    ADD COLUMN `username` VARCHAR(255) NULL,
    ADD COLUMN `role` ENUM('user', 'modo', 'admin') NOT NULL DEFAULT 'user',
    ADD COLUMN `is_verified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `inscription_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `is_banned` BOOLEAN NOT NULL DEFAULT false;

-- Backfill username for existing users before making the column required.
UPDATE `user`
SET `username` = CONCAT('user_', `id`)
WHERE `username` IS NULL;

ALTER TABLE `user`
    MODIFY `username` VARCHAR(255) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `user_username_key` ON `user`(`username`);

-- CreateTable
CREATE TABLE `product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `image_url` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `category` VARCHAR(255) NOT NULL,
    `release_date` DATE NOT NULL,
    `description` TEXT NOT NULL,
    `user_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opinion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `note` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `text` TEXT NOT NULL,
    `product_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `text` TEXT NOT NULL,
    `opinion_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `userslikedopinion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `opinion_id` INTEGER NOT NULL,

    UNIQUE INDEX `userslikedopinion_user_id_opinion_id_key`(`user_id`, `opinion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `userslikedcomment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `liked_comment_id` INTEGER NOT NULL,

    UNIQUE INDEX `userslikedcomment_user_id_liked_comment_id_key`(`user_id`, `liked_comment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `product_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opinion` ADD CONSTRAINT `opinion_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opinion` ADD CONSTRAINT `opinion_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comment` ADD CONSTRAINT `comment_opinion_id_fkey` FOREIGN KEY (`opinion_id`) REFERENCES `opinion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comment` ADD CONSTRAINT `comment_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userslikedopinion` ADD CONSTRAINT `userslikedopinion_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userslikedopinion` ADD CONSTRAINT `userslikedopinion_opinion_id_fkey` FOREIGN KEY (`opinion_id`) REFERENCES `opinion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userslikedcomment` ADD CONSTRAINT `userslikedcomment_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userslikedcomment` ADD CONSTRAINT `userslikedcomment_liked_comment_id_fkey` FOREIGN KEY (`liked_comment_id`) REFERENCES `comment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
