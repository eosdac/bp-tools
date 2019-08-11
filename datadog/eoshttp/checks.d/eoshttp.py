import urllib2
import simplejson
import datetime
from checks import AgentCheck

__version__ = '1.0.0'

class CheckValue(AgentCheck):
  def check(self, instance):

    host = instance['host']
    port = instance['port']
    name = instance['name']


    url = "http://%s:%s/v1/chain/get_info" % (host, port)
    try:
      response = urllib2.urlopen(url)
    except:
      self.service_check('eoshttp.'+name+'.is_ok', 2)
      return

    data = simplejson.load(response)


    # Check lib difference to head
    lib_diff = data['head_block_num'] - data['last_irreversible_block_num']

    self.gauge('eoshttp.'+name+'.lib_distance', lib_diff)


    # Difference between now and head block time
    head_time_str = data['head_block_time']
    head_time_date = datetime.datetime.strptime(head_time_str, '%Y-%m-%dT%H:%M:%S.%f')

    now_date = datetime.datetime.now()

    diff_sec = int(now_date.strftime("%s")) - int(head_time_date.strftime("%s"))

    self.gauge('eoshttp.'+name+'.head_offset', diff_sec)


    # Service is ok
    self.service_check('eoshttp.'+name+'.is_ok', 0)
