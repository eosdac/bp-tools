#!/bin/bash

sudo mkdir -p /etc/datadog-agent/conf.d/eoshttp.d
if [[ ! -f /etc/datadog-agent/conf.d/eoshttp.d/conf.yaml ]]; then
    sudo cp eoshttp.d/conf.yaml /etc/datadog-agent/conf.d/eoshttp.d
fi
sudo cp checks.d/eoshttp.py /etc/datadog-agent/checks.d
sudo service datadog-agent restart
