CREATE TABLE `catalog_sync_schedule` (
	`key` varchar(64) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`cron` varchar(64) NOT NULL DEFAULT '0 0 3 * * *',
	`enabled` boolean NOT NULL DEFAULT false,
	`nextExecutionAt` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `catalog_sync_schedule_key` PRIMARY KEY(`key`)
);
