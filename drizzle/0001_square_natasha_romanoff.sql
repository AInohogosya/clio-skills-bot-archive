CREATE TABLE `catalog_syncs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` enum('success','error') NOT NULL,
	`syncedCount` int NOT NULL DEFAULT 0,
	`errorText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalog_syncs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skill_catalog` (
	`sourceId` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(96) NOT NULL,
	`description` text NOT NULL,
	`author` varchar(255) NOT NULL,
	`version` varchar(64) NOT NULL,
	`keywords` json NOT NULL,
	`useCases` json NOT NULL,
	`inputs` json NOT NULL,
	`steps` json NOT NULL,
	`sourceUrl` varchar(512) NOT NULL,
	`status` enum('ready','setup') NOT NULL DEFAULT 'ready',
	`helpText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `skill_catalog_sourceId` PRIMARY KEY(`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `skill_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `skill_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skill_favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceId` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `skill_favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `skill_favorites_user_skill_unique` UNIQUE(`userId`,`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `skill_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `skill_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skill_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceId` varchar(128) NOT NULL,
	`taskText` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `skill_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `skill_catalog_category_idx` ON `skill_catalog` (`category`);--> statement-breakpoint
CREATE INDEX `skill_conversations_user_idx` ON `skill_conversations` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `skill_favorites_user_idx` ON `skill_favorites` (`userId`);--> statement-breakpoint
CREATE INDEX `skill_messages_conversation_idx` ON `skill_messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `skill_usage_user_created_idx` ON `skill_usage` (`userId`,`createdAt`);