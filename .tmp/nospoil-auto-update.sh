#!/bin/bash
PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
cd /www/wwwroot/scgs.tv || exit 1
/usr/bin/node auto-update.js --playwright >> auto_update_cron.log 2>&1
