const Template = require('../../base/template');


const {sleep, writeFileJSON, singleRun} = require('../../../lib/common');
const {getEnv} = require('../../../lib/env');
const {formatRequest} = require('../../../../charles/websocket/api');
const fs = require('fs');
const _ = require('lodash');

// 获取数据并清空
const originRequestPath = require('path').resolve(__dirname, './originRequest.txt');
const originRequest = fs.readFileSync(originRequestPath).toString();
fs.writeFileSync(originRequestPath, '');

class EarnJoinGroup extends Template {
  static scriptName = 'EarnJoinGroup';
  static scriptNameDesc = '参团(小程序)';
  static dirname = __dirname;
  static times = 1;
  static commonParamFn = () => ({});
  static cookieKeys = ['wq_uin', 'wq_skey'];
  static needInApp = false;

  static apiOptions = {
    options: {
      uri: 'https://wq.jd.com/mjgj_active/super_fission',
      qs: {
        g_ty: 'ls',
        g_tk: '1844967756',
      },
      headers: {
        // TODO user-agent 应该是不用的, 先用着
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.16(0x18001028) NetType/WIFI Language/zh_CN miniProgram',
      },
    },
  };

  static isSuccess(data) {
    return _.property('retcode')(data) === 0;
  }

  static async doMain(api, shareCodes) {
    const self = this;

    const shareCookieIndex = getEnv('JD_EARNJOINGROUP_SHARE_COOKIE_INDEX', 0, -1);

    if (shareCookieIndex < 0) return console.log('请手动指定 cookie index');

    // 获取 active_id 和 group_id
    const result = formatRequest(originRequest);
    const getUrl = o => _.get(o, 'request.URI');
    const homePageData = result.find(o => getUrl(o).match('SuperFissionHomepage'));
    if (!homePageData) return console.log('活动不存在');
    const searchParams = new URL(`http:/${getUrl(homePageData)}`).searchParams;
    // 活动 id, 每个活动的值是固定的
    const activeId = searchParams.get('active_id');
    // 团 id , 每个人都不一样的
    const groupId = searchParams.get('group_id');
    const referer = _.get(homePageData, 'request.HEADER.referer');

    if (!activeId || !groupId) {
      return api.log('活动不存在');
    }

    _.merge(api.options, {
      qs: {
        active_id: activeId,
        group_id: groupId,
      },
      headers: {referer},
    });

    const {
      active_info: {
        share_info: {
          share_title,
        },
        show_content: {
          task_id,
          browse_create_task_duration,
          browse_task_duration,
          task_status,
        },
      },
      group_info: {
        is_member,
      },
      basic_group_info: {
        group_status,
      },
      prize_enough,
      prize_remain,
      user_info: {
        can_create_group,
        can_create_group_userlabel,
        can_join_group,
        can_join_group_userlabel,
        no_join_group_reason,
      },
    } = await api.doGetPath('SuperFissionHomepage').then(_.property('data'));

    const log = str => api.log(`[${share_title}-${groupId}] ${str}`);

    if (group_status === 3) {
      return log(`已成功`);
    }
    if (is_member === 1) {
      return log(`已在团中, 无需重复参加`);
    }
    if (no_join_group_reason === 10003) {
      return log(`不可参加自己开的团`);
    }
    if (no_join_group_reason === 10004 || can_join_group < can_join_group_userlabel || can_join_group === 0) {
      return log(`已没次数参加`);
    }
    if (!prize_remain || !prize_enough) {
      return log(`已结束`);
    }
    // 参团
    await sleep(browse_create_task_duration || 2);
    const doTaskSucceed = await api.doGetPath('SuperFissionDoTask', {task_id}).then(self.isSuccess);
    if (!doTaskSucceed) return log('doTask 失败');
    await sleep(browse_task_duration + 2);
    // 参团
    await api.doGetPath('SuperFissionJoinGroup').then(data => {
      if (self.isSuccess(data)) {
        log('参团成功');
      } else {
        log(`参团失败(retcode: ${data.retcode}, msg: ${data.msg})`);
      }
    });

  }
}

singleRun(EarnJoinGroup).then();

module.exports = EarnJoinGroup;
