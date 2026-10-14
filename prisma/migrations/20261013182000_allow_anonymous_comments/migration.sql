-- Allow visitors without an account to publish comments.
SET @comment_user_fk = (
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'comment'
        AND COLUMN_NAME = 'user_id'
        AND REFERENCED_TABLE_NAME = 'user'
    LIMIT 1
);

SET @drop_comment_user_fk = IF(
    @comment_user_fk IS NULL,
    'SELECT 1',
    CONCAT('ALTER TABLE `comment` DROP FOREIGN KEY `', @comment_user_fk, '`')
);

PREPARE drop_comment_user_fk_stmt FROM @drop_comment_user_fk;
EXECUTE drop_comment_user_fk_stmt;
DEALLOCATE PREPARE drop_comment_user_fk_stmt;

ALTER TABLE `comment` MODIFY `user_id` INTEGER NULL;

ALTER TABLE `comment` ADD CONSTRAINT `comment_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
