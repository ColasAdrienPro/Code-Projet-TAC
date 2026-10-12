-- CreateTable
CREATE TABLE `category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `category_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed common categories for a general review website.
INSERT INTO `category` (`name`) VALUES
    ('Films'),
    ('Series'),
    ('Jeux video'),
    ('Livres'),
    ('Musique'),
    ('Restaurants'),
    ('Voyages'),
    ('Technologie'),
    ('Applications'),
    ('Mode'),
    ('Beaute'),
    ('Sport'),
    ('Maison'),
    ('Alimentation'),
    ('Services'),
    ('Autres');

-- Preserve existing free-text product categories before replacing the column.
INSERT IGNORE INTO `category` (`name`)
SELECT DISTINCT TRIM(`category`)
FROM `product`
WHERE TRIM(`category`) <> '';

-- AlterTable
ALTER TABLE `product` ADD COLUMN `category_id` INTEGER NULL;

-- Backfill products with their matching category.
UPDATE `product` p
INNER JOIN `category` c ON c.`name` = TRIM(p.`category`)
SET p.`category_id` = c.`id`;

-- Fallback for any unexpected empty category.
UPDATE `product`
SET `category_id` = (SELECT `id` FROM `category` WHERE `name` = 'Autres' LIMIT 1)
WHERE `category_id` IS NULL;

-- AlterTable
ALTER TABLE `product`
    MODIFY `category_id` INTEGER NOT NULL,
    DROP COLUMN `category`;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `product_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
