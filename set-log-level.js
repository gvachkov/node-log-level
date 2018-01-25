#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */

const _ = require('lodash');
const assert = require('assert');
const cmdParse = require('minimist');
const debug = require('debug')('niveau:set-level');
const redis = require('redis');
const timeParse = require('timeparse');
const { LOG_CONFIG_KEY, readRedisOptions } = require('./lib/common');

const cmdOptions = cmdParse(process.argv.slice(2), {
  alias: {
    l: 'url',
    h: 'header',
    i: 'ip',
    x: 'expire',
    r: 'reset'
  }
});
debug('Command line options:', cmdOptions);

if (cmdOptions.reset) {
  assert(
    !cmdOptions._.length &&
    !['url', 'header', 'ip', 'expire'].some(opt => opt in cmdOptions),
    'No other options allowed with reset'
  );
} else {
  assert(cmdOptions._.length === 1, 'Provide exactly one log level');
  var level = cmdOptions._[0];
}

let headers = _.reduce(cmdOptions.header, (result, h) => {
  let i = h.indexOf(':');
  assert(i > 0, 'headers');
  result[h.slice(0, i).trim()] = h.slice(i + 1).trim();
}, {});

let expire;
if (cmdOptions.expire) {
  if (!cmdOptions.expire.endsWith('r')) {
    expire = timeParse(cmdOptions.expire, 's');
  }
}

let logConfig = {
  request: {
    url: cmdOptions.url,
    ip: cmdOptions.ip,
    headers
  },
  // requestCounterKey: 'counter-name',
  level
};

const client = redis.createClient(readRedisOptions());

client.on("error", function (err) {
  console.error(err);
});

client.config('set', 'notify-keyspace-events', 'KA', (err, reply) => {
  err ? console.error('notify-keyspace-events', err) :
    console.log('notify-keyspace-events', reply);

  if (cmdOptions.reset) {
    debug('redis DEL %s', LOG_CONFIG_KEY);
    client.del(LOG_CONFIG_KEY, (err, reply) => {
      err ? console.error('redis DEL:', err) : debug('redis:', reply);
      client.quit();
    });
  } else {
    debug('redis SET %s', LOG_CONFIG_KEY, logConfig);
    let params = [LOG_CONFIG_KEY, JSON.stringify(logConfig)];
    expire && params.push('EX', expire);
    client.set(params, (err, reply) => {
      err ? console.error('redis SET:', err) : debug('redis:', reply);
      client.quit();
    });
  }
});
