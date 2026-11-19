/* 掼蛋训练引擎（纯逻辑，无 DOM 依赖）
 * 兼容浏览器与 Windows JScript(cscript)。
 * 牌表示：{ id, v, suit }  v: 3..15 = 3..K(13),A(14),2(15)；16=小王，17=大王；suit: S/H/D/C/JOKER
 * level（打几）：3..15，打A 记 14，打2 记 15。
 */
var GuandanEngine = (function () {
  var LEVEL_NAMES = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };

  function makeDeck() {
    var deck = [], id = 0, suits = ['S', 'H', 'D', 'C'], v, s, k;
    for (k = 0; k < 2; k++) {           // 两副牌
      for (v = 3; v <= 15; v++) {
        for (s = 0; s < 4; s++) { deck.push({ id: id++, v: v, suit: suits[s] }); }
      }
      deck.push({ id: id++, v: 16, suit: 'JOKER' });   // 小王
      deck.push({ id: id++, v: 17, suit: 'JOKER' });   // 大王
    }
    return deck;
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    var i, j, t;
    for (i = arr.length - 1; i > 0; i--) {
      j = Math.floor(rng() * (i + 1));
      t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function dealHand(level, rng) {
    var deck = shuffle(makeDeck(), rng);
    var hand = deck.slice(0, 27);
    sortHand(hand, level);
    return hand;
  }

  // 单张比大小槽位：3..13 < A(14) < 2(15) < 级牌(16) < 小王(17) < 大王(18)
  // 打A时：2 归最小(3)，其余点数顺移一格，A 占级牌位(16)
  function sortValue(v, level) {
    if (v === 17) return 18;
    if (v === 16) return 17;
    if (level === 14) {
      if (v === 14) return 16;   // A 是级牌
      if (v === 15) return 3;    // 2 最小
      return v + 1;              // 3..13 → 4..14
    }
    if (v === level) return 16;  // 级牌（打2时 v=15 也进 16）
    if (v === 15) return 15;     // 2
    return v;                    // 3..14
  }

  function svToV(sv, level) {
    if (sv === 18) return 17;
    if (sv === 17) return 16;
    if (level === 14) {
      if (sv === 16) return 14;
      if (sv === 3) return 15;
      return sv - 1;             // 4..14 → 3..13
    }
    if (sv === 16) return level;
    return sv;
  }

  // 连张（顺子/连对/钢板/同花顺）自然位：返回 2..14（2..A 的本来点数），王返回 -1
  // 级牌回本来位置；A 在 14 位（也可当 1，由 arr[0] 槽处理）
  function natOf(v, level) {
    if (v >= 16) return -1;
    if (level === 14) {
      if (v === 14) return 14;
      if (v === 15) return 2;
      return v;
    }
    if (v === level) return level === 15 ? 2 : level;   // 级牌回本来位（打2→2位）
    if (v === 15) return 2;
    return v;
  }

  // 连张检测数组：arr[0]=A当1的数量，arr[1]=2的数，…arr[12]=K的数，arr[13]=A总数（高位窗口从其中扣）
  // aUsed14 = 已用于 A14 位的 A 数；aUsed0 = 已用于 A1 位的 A 数
  function buildNatArr(countsOf, level) {
    var arr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var sv;
    for (sv = 3; sv <= 16; sv++) {
      var c = countsOf[sv] || 0;
      if (!c) continue;
      var nat = natOf(svToV(sv, level), level);
      if (nat < 2) continue;
      arr[nat - 1] += c;   // 2→1, 3→2, ..., K→12, A→13
    }
    arr.aUsed14 = 0;
    arr.aUsed0 = 0;
    return arr;
  }

  // 在 arr 上扫长度为 len、每位 need 张的连张窗口；高位窗口优先；配牌补缺；返回消耗结果
  function detectRuns(countsOf, level, peiLeft, len, need, suitFilter) {
    var arr = buildNatArr(countsOf, level);
    var runs = [];
    var maxW = 14 - len;
    for (var w = maxW; w >= 0; w--) {
      var needPei = 0, ok = true, j, slot, avail;
      for (j = 0; j < len; j++) {
        slot = w + j;
        if (slot === 0) {
          avail = arr[13] - arr.aUsed0 - arr.aUsed14;   // A1 可用 = A池 - 两边已用
        } else if (slot === 13) {
          avail = arr[13] - arr.aUsed14;
        } else {
          avail = arr[slot];
        }
        if (avail >= need) continue;
        needPei += need - Math.max(avail, 0);
        if (needPei > peiLeft) { ok = false; break; }
      }
      if (!ok) continue;
      for (j = 0; j < len; j++) {
        slot = w + j;
        if (slot === 0) arr.aUsed0 += need;
        else if (slot === 13) arr.aUsed14 += need;
        else arr[slot] -= need;
      }
      peiLeft -= needPei;
      var slots = [];
      for (j = 0; j < len; j++) slots.push(w + j);
      runs.push({ from: w, peiUsed: needPei, slots: slots });
      w++;   // 同一窗口可能还能再来一组（张数富余时），重新检查当前 w
    }
    return { runs: runs, peiLeft: peiLeft, aUsed14: arr.aUsed14, aUsed0: arr.aUsed0 };
  }

  var SLOT_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  function runLabel(from, len) {
    var parts = [];
    for (var j = 0; j < len; j++) parts.push(SLOT_NAMES[from + j]);
    return parts.join('-');
  }

  function rankLabel(v) {
    if (v === 16) return '小王';
    if (v === 17) return '大王';
    return LEVEL_NAMES[v];
  }

  function isPei(card, level) { return card.suit === 'H' && card.v === level; }  // 红桃级牌 = 逢人配

  function cardLabel(card, level) {
    var s = card.suit === 'S' ? '♠' : card.suit === 'H' ? '♥' : card.suit === 'D' ? '♦' : card.suit === 'C' ? '♣' : '';
    return s + rankLabel(card.v) + (isPei(card, level) ? '⭐' : '');
  }

  function sortHand(hand, level) {
    hand.sort(function (a, b) {
      var d = sortValue(b.v, level) - sortValue(a.v, level);
      if (d !== 0) return d;
      return a.id - b.id;
    });
    return hand;
  }

  // ---------- 牌型分析 ----------
  // counts[sv] = 硬牌张数（不含配），sv 3..18；peis = 配牌数
  function analyze(hand, level) {
    var counts = {}, sv, i, card;
    for (sv = 3; sv <= 18; sv++) counts[sv] = 0;
    var peis = 0;
    for (i = 0; i < hand.length; i++) {
      card = hand[i];
      sv = sortValue(card.v, level);
      counts[sv]++;
      if (isPei(card, level)) peis++;
    }

    var rem = {}, k;
    for (k in counts) rem[k] = counts[k];
    rem[16] -= peis;   // 级牌位去掉配牌，结构只按硬牌拆解

    var bombs = [], hands = 0, singles = 0, structures = [];
    var peiLeft = peis;

    // 1) 炸弹（4张及以上同槽位）
    for (sv = 3; sv <= 18; sv++) {
      if (rem[sv] >= 4) {
        var bn = rem[sv] >= 8 ? 8 : rem[sv];
        bombs.push({ sv: sv, n: bn, label: rankLabel(svToV(sv, level)) + 'x' + bn });
        structures.push('炸弹 ' + rankLabel(svToV(sv, level)) + '×' + bn);
        hands++; rem[sv] -= bn;
      }
    }

    // 1b) 配牌补炸：3硬+1配=4炸；2硬+2配=5炸（掼蛋基本操作，计入炸弹与手数）
    for (sv = 3; sv <= 18; sv++) {
      if (peiLeft >= 1 && rem[sv] === 3) {
        bombs.push({ sv: sv, n: 4, label: rankLabel(svToV(sv, level)) + 'x4', usedPei: 1 });
        structures.push('炸弹 ' + rankLabel(svToV(sv, level)) + '×4(含配)');
        hands++; rem[sv] -= 3; peiLeft--;
      } else if (peiLeft >= 2 && rem[sv] === 2) {
        bombs.push({ sv: sv, n: 5, label: rankLabel(svToV(sv, level)) + 'x5', usedPei: 2 });
        structures.push('炸弹 ' + rankLabel(svToV(sv, level)) + '×5(含2配)');
        hands++; rem[sv] -= 2; peiLeft -= 2;
      }
    }

    // 2) 同花顺：在剩余硬牌上按花色检测（高位窗口优先），消耗 rem 防与顺子重复
    var suits = ['S', 'H', 'D', 'C'], suitName = { S: '黑桃', H: '红桃', D: '方块', C: '梅花' };
    var suitRuns = [], sflushA = 0, sflushLevel = 0;
    var bySuit = { S: {}, H: {}, D: {}, C: {} };
    for (sv = 3; sv <= 18; sv++) { bySuit.S[sv] = 0; bySuit.H[sv] = 0; bySuit.D[sv] = 0; bySuit.C[sv] = 0; }
    for (i = 0; i < hand.length; i++) {
      card = hand[i];
      if (card.suit === 'JOKER' || isPei(card, level)) continue;
      bySuit[card.suit][sortValue(card.v, level)]++;
    }
    for (var su = 0; su < 4; su++) {
      var suit = suits[su], m = bySuit[suit];
      // 该花色可用计数 = min(该花色有, rem 余量)
      var avail = {};
      for (sv = 3; sv <= 18; sv++) avail[sv] = Math.min(m[sv] || 0, rem[sv] || 0);
      var r5 = detectRuns(avail, level, peiLeft, 5, 1);
      for (i = 0; i < r5.runs.length; i++) {
        var run5 = r5.runs[i];
        suitRuns.push({ suit: suit, from: run5.from, label: suitName[suit] + runLabel(run5.from, 5) });
        structures.push('同花顺 ' + suitName[suit] + runLabel(run5.from, 5));
        hands++;
        var aInRun = 0, lvlInRun = 0;
        for (var j5 = 0; j5 < run5.slots.length; j5++) {
          var sv5 = slotToSv(run5.slots[j5], level);
          if (rem[sv5] > 0) rem[sv5]--;
          if (sv5 === 14) aInRun++;
          if (sv5 === 16) lvlInRun++;
        }
        if (run5.from === 0) aInRun++;          // A1 位的 A（slot0 不在 slots 的 sv 扣减里）
        sflushA += aInRun;
        sflushLevel += lvlInRun;
      }
      peiLeft = r5.peiLeft;
    }

    // 3) 钢板（2个连续三同张）
    var r6 = detectRuns(rem, level, peiLeft, 2, 3);
    for (i = 0; i < r6.runs.length; i++) {
      var run6 = r6.runs[i];
      structures.push('钢板 ' + runLabel(run6.from, 2));
      hands++;
      for (var j6 = 0; j6 < run6.slots.length; j6++) {
        var sv6 = slotToSv(run6.slots[j6], level);
        if (rem[sv6] >= 3) rem[sv6] -= 3;
      }
    }
    peiLeft = r6.peiLeft;

    // 4) 三带二（先按 sv 找三张，再配对子；跳过有连对潜力的对子——连对一手6张更省）
    function inPairRun(s2) {
      if ((rem[s2 - 2] || 0) >= 2 && (rem[s2 - 1] || 0) >= 2) return true;
      if ((rem[s2 - 1] || 0) >= 2 && (rem[s2 + 1] || 0) >= 2) return true;
      if ((rem[s2 + 1] || 0) >= 2 && (rem[s2 + 2] || 0) >= 2) return true;
      return false;
    }
    for (sv = 3; sv <= 18; sv++) {
      if (rem[sv] >= 3) {
        var sv2, found = -1;
        for (sv2 = 3; sv2 <= 18; sv2++) {
          if (sv2 !== sv && rem[sv2] >= 2 && !inPairRun(sv2)) { found = sv2; break; }
        }
        if (found > 0) {
          structures.push('三带二 ' + rankLabel(svToV(sv, level)) + '带' + rankLabel(svToV(found, level)));
          hands++; rem[sv] -= 3; rem[found] -= 2;
        } else {
          // 找不到不伤连对的带牌，退回任意最小对子
          for (sv2 = 3; sv2 <= 18; sv2++) {
            if (sv2 !== sv && rem[sv2] >= 2) { found = sv2; break; }
          }
          if (found > 0) {
            structures.push('三带二 ' + rankLabel(svToV(sv, level)) + '带' + rankLabel(svToV(found, level)));
            hands++; rem[sv] -= 3; rem[found] -= 2;
          } else {
            structures.push('三同张 ' + rankLabel(svToV(sv, level)));
            hands++; rem[sv] -= 3;
          }
        }
      }
    }

    // 5) 顺子（5连，高位优先）
    var r5b = detectRuns(rem, level, peiLeft, 5, 1);
    for (i = 0; i < r5b.runs.length; i++) {
      var run5b = r5b.runs[i];
      structures.push('顺子 ' + runLabel(run5b.from, 5));
      hands++;
      for (var j5b = 0; j5b < run5b.slots.length; j5b++) {
        var sv5b = slotToSv(run5b.slots[j5b], level);
        if (rem[sv5b] > 0) rem[sv5b]--;
      }
    }
    peiLeft = r5b.peiLeft;

    // 6) 连对（3连对）
    var r7 = detectRuns(rem, level, peiLeft, 3, 2);
    for (i = 0; i < r7.runs.length; i++) {
      var run7 = r7.runs[i];
      structures.push('连对 ' + runLabel(run7.from, 3));
      hands++;
      for (var j7 = 0; j7 < run7.slots.length; j7++) {
        var sv7 = slotToSv(run7.slots[j7], level);
        if (rem[sv7] >= 2) rem[sv7] -= 2;
      }
    }
    peiLeft = r7.peiLeft;

    // 7) 残余：对子与单张
    for (sv = 3; sv <= 18; sv++) {
      while (rem[sv] >= 2) { structures.push('对子 ' + rankLabel(svToV(sv, level))); hands++; rem[sv] -= 2; }
      if (rem[sv] === 1) { singles++; hands++; }
    }

    return {
      counts: counts, peis: peis, bombs: bombs, suitRuns: suitRuns,
      hands: hands, singles: singles, structures: structures,
      sflushA: sflushA, sflushLevel: sflushLevel,
      wildNote: peis > 0 ? '配牌 ' + peis + ' 张（已尽量用于补炸/补连张）' : ''
    };
  }

  function slotToSv(slot, level) {
    var nat = slot + 1;   // slot1→nat2(2) … slot13→nat14(A)
    if (level === 14) {
      if (nat === 14) return 16;   // A 级牌
      if (nat === 2) return 3;     // 2
      return nat + 1;              // 3..13 → 4..14
    }
    if (nat === 2) return level === 15 ? 16 : 15;   // 2（打2时是级牌）
    if (nat === level) return 16;                   // 级牌
    return nat;                                     // 3..14（A=14）
  }

  // ---------- 记点法评估（12分制：大王3/小王2/配2.5/级牌1.5/A1/同花顺5/手数(7-轮)×1.5） ----------
  var TIER_NAMES = ['弱辅助', '辅助', '均衡', '主攻', '强攻'];

  function evaluate(hand, level) {
    var a = analyze(hand, level);
    var parts = [];
    var bigJ = a.counts[18], smallJ = a.counts[17];
    if (bigJ) parts.push({ name: '大王×' + bigJ, score: bigJ * 3 });
    if (smallJ) parts.push({ name: '小王×' + smallJ, score: smallJ * 2 });

    // A 与级牌若已进炸弹/同花顺，不再重复计单张分
    var bombHasA = false, bombHasLevel = false, i, b;
    for (i = 0; i < a.bombs.length; i++) {
      b = a.bombs[i];
      if (b.sv === 14) bombHasA = true;
      if (b.sv === 16) bombHasLevel = true;
    }
    var levelCount = a.counts[16];            // 级牌（含红桃配）
    var plainLevel = levelCount - a.peis;
    var lvlScore = plainLevel;
    if (bombHasLevel || plainLevel >= 4) lvlScore = 0;     // 全在炸里
    else lvlScore = Math.max(0, plainLevel - a.sflushLevel); // 减去同花顺用掉的
    if (lvlScore > 0) parts.push({ name: '级牌×' + lvlScore, score: lvlScore * 1.5 });
    if (a.peis > 0) parts.push({ name: '红心配×' + a.peis, score: a.peis * 2.5 });
    if (level !== 14) {
      var acesRaw = a.counts[14] || 0;
      var aces = 0;
      if (!bombHasA && acesRaw < 4) aces = Math.max(0, acesRaw - a.sflushA);
      if (aces > 0) parts.push({ name: 'A×' + aces, score: aces });
    }

    if (a.suitRuns.length > 0) parts.push({ name: '同花顺×' + a.suitRuns.length, score: a.suitRuns.length * 5 });
    // 4炸3 / 5炸4 / 6炸及以上一律6（含7炸8炸）；同花顺5分介于5炸与6炸之间
    var bombPts = { 4: 3, 5: 4, 6: 6, 7: 6, 8: 6 }, bombScore = 0, bombDesc = [];
    for (i = 0; i < a.bombs.length; i++) {
      b = a.bombs[i];
      bombScore += bombPts[b.n] || 0;
      bombDesc.push(b.label);
    }
    if (bombScore > 0) parts.push({ name: '炸弹（' + bombDesc.join('、') + '）', score: bombScore });
    if (bigJ >= 2 && smallJ >= 2) parts.push({ name: '四大天王', score: 6 });
    var handAdj = (7 - a.hands) * 1.5;
    parts.push({ name: '手数 ' + a.hands + ' 轮（基准7轮）', score: handAdj });

    var total = 0;
    for (i = 0; i < parts.length; i++) total += parts[i].score;
    var tier = total >= 12 ? 4 : total >= 8 ? 3 : total >= 5 ? 2 : total >= 2 ? 1 : 0;
    var tierName = TIER_NAMES[tier];

    var facts = [];
    facts.push('王：大王' + bigJ + ' 小王' + smallJ + (bigJ >= 2 && smallJ >= 2 ? '（四大天王，全场最大）' : ''));
    facts.push('硬炸 ' + a.bombs.length + ' 个' + (a.bombs.length ? '：' + bombList(a.bombs) : '') + (a.suitRuns.length ? '；同花顺 ' + a.suitRuns.length + ' 个' : ''));
    facts.push('级牌 ' + levelCount + ' 张' + (a.peis ? '，其中配牌⭐ ' + a.peis + ' 张' : '') + (plainLevel > lvlScore ? '（部分已进炸/同花顺，不单计）' : ''));
    facts.push('估手数约 ' + a.hands + ' 手，单张散牌 ' + a.singles + ' 张' + (a.peis ? '（配牌已尽量用于补型）' : ''));

    var advice = [];
    if (tier >= 3) {
      advice.push(handAdj >= 0 ? '牌整火力足：应主动抢攻，快速甩完主跑牌型，大炸留着收牌权。' : '火力够但牌偏散：先小牌理顺结构，不要急着开炸，炸用来抢关键牌权。');
      advice.push('定位主攻：目标自己走头游，顺带留意对家牌路。');
    } else if (tier === 2) {
      advice.push('牌力居中：先看一轮牌权走向再定打法，能接就接，别硬拼大炸。');
      advice.push('定位灵活：对家强攻时转助攻，下家弱时可偷袭上游。');
    } else {
      advice.push('牌力偏弱：收缩防守，定位助攻——出对家容易接的牌型，把牌权送给对家。');
      advice.push('炸（若有）留作保底：拦下家关键手或保对家出牌，不要轻易开炸。');
    }

    return {
      parts: parts, total: total, tier: tier, tierName: tierName,
      facts: facts, advice: advice,
      analysis: a, bigJ: bigJ, smallJ: smallJ, levelCount: levelCount
    };
  }

  function bombList(bombs) {
    var out = [], i;
    for (i = 0; i < bombs.length; i++) out.push(bombs[i].label);
    return out.join('、');
  }

  // ---------- 首攻推荐与出题 ----------
  function suggestOpening(hand, level, ev) {
    var a = ev.analysis, i, sv;
    var pickRun = null, maxLen = 0;
    for (i = 0; i < a.structures.length; i++) {
      var st = a.structures[i];
      if (st.indexOf('顺子') === 0 && st.length > maxLen) { pickRun = st; maxLen = st.length; }
    }
    var pairMin = null, tripMin = null;
    for (i = 0; i < a.structures.length; i++) {
      var st2 = a.structures[i];
      if (st2.indexOf('对子') === 0 && pairMin === null) pairMin = st2;
      if (st2.indexOf('三带二') === 0 && tripMin === null) tripMin = st2;
    }
    var bigBomb = null;
    for (i = 0; i < a.bombs.length; i++) if (a.bombs[i].n >= 5) { bigBomb = a.bombs[i]; break; }

    var rec, recKind, reason;
    if (ev.tier >= 3 && a.hands <= 9) {
      rec = pickRun || tripMin || pairMin || '中等单张';
      recKind = 'run';
      reason = '牌力强且手数少，首攻应快速减少手数：' + rec + '。大炸（' + (bigBomb ? bigBomb.label : '无') + '）留在手里收牌权，首攻不要开炸。';
    } else if (ev.tier >= 3) {
      rec = pairMin || tripMin || '小单张';
      recKind = 'probe';
      reason = '火力够但牌偏散（约' + a.hands + '手）：先用小牌探路理顺结构，'+rec+'起步，等牌权清晰再决定炸的使用。';
    } else if (ev.tier === 2) {
      rec = tripMin || pairMin || '中档单张';
      recKind = 'probe';
      reason = '牌力居中，首攻目的是试探与送牌权：' + rec + '。观察上下家反应后再定主攻还是助攻。';
    } else {
      rec = pairMin || '小对子';
      recKind = 'support';
      reason = '牌力偏弱，定位助攻：首攻出 ' + rec + ' 这类方向牌，方便对家接牌；自己的大牌与炸全部留用。';
    }

    // 干扰项：都是合理牌型，不再出现"首轮开炸"这类离谱选项
    var distract = ['出最小单张探路', '出最大对子压场', '单张级牌起步（浪费大牌）', '先出最小三带二/顺子'];
    if (tripMin) distract[3] = '先出' + tripMin + '看看风向';

    var options = [{ text: rec, correct: true, kind: recKind }];
    var used = {};
    used[rec] = true;
    var di = 0, guard = 0;
    while (options.length < 4 && di < distract.length && guard < 20) {
      var t = distract[di++];
      guard++;
      if (used[t]) continue;
      used[t] = true;
      options.push({ text: t, correct: false });
    }

    return { recommend: rec, recommendKind: recKind, reason: reason, options: shuffle(options) };
  }

  function buildQuiz(hand, level) {
    var ev = evaluate(hand, level);
    var sug = suggestOpening(hand, level, ev);
    return { evalResult: ev, suggestion: sug, hand: hand, level: level };
  }

  // ---------- 理牌区行校验：判断一组牌构成什么牌型 ----------
  function classifyRow(cards, level) {
    if (!cards || cards.length === 0) return { type: 'empty', label: '' };
    var peis = 0, hards = [], i, sc = {};
    for (i = 0; i < cards.length; i++) {
      if (isPei(cards[i], level)) { peis++; continue; }
      hards.push(cards[i]);
      var sv0 = sortValue(cards[i].v, level);
      sc[sv0] = (sc[sv0] || 0) + 1;
    }
    var n = cards.length;
    var keys = [];
    for (var k in sc) keys.push(parseInt(k, 10));
    keys.sort(function (a, b) { return b - a; });

    function withPei(t) { return peis > 0 ? t + '（含配）' : t; }

    if (keys.length <= 1) {          // 全同槽位（含全配）
      if (n >= 4) return { type: 'bomb', label: withPei('炸弹×' + n) };
      if (n === 3) return { type: 'trips', label: withPei('三同张') };
      if (n === 2) return { type: 'pair', label: withPei('对子') };
      return { type: 'single', label: '单张' };
    }
    var hasJoker = false;
    for (i = 0; i < hards.length; i++) if (hards[i].v >= 16) hasJoker = true;

    if (n === 5 && !hasJoker) {
      var suits = ['S', 'H', 'D', 'C'], su;
      for (su = 0; su < 4; su++) {
        var suit = suits[su], scc = {};
        for (i = 0; i < hards.length; i++) {
          if (hards[i].suit !== suit) continue;
          var sv1 = sortValue(hards[i].v, level);
          scc[sv1] = (scc[sv1] || 0) + 1;
        }
        if (detectRuns(scc, level, peis, 5, 1).runs.length > 0) return { type: 'sflush', label: withPei('同花顺') };
      }
      if (detectRuns(sc, level, peis, 5, 1).runs.length > 0) return { type: 'straight', label: withPei('顺子') };
    }
    if (n === 6 && !hasJoker) {
      if (detectRuns(sc, level, peis, 3, 2).runs.length > 0) return { type: 'pairs', label: withPei('连对') };
      if (detectRuns(sc, level, peis, 2, 3).runs.length > 0) return { type: 'steel', label: withPei('钢板') };
    }
    if (n === 5) {                   // 三带二
      var a, b, ca, cb, nd;
      for (var ka = 0; ka < keys.length; ka++) {
        a = keys[ka];
        ca = Math.min(sc[a], 3);
        for (var kb = 0; kb < keys.length; kb++) {
          b = keys[kb];
          if (b === a) continue;
          cb = Math.min(sc[b], 2);
          nd = (3 - ca) + (2 - cb);
          if (nd === peis) return { type: 'fullhouse', label: withPei('三带二') };
        }
      }
    }
    return { type: 'mixed', label: '未成牌型' };
  }

  // ---------- 自检 ----------
  function selfTest(n) {
    n = n || 2000;
    var i, j, dist = {}, tierDist = [0, 0, 0, 0, 0], bad = 0, msgs = [];
    for (i = 0; i < n; i++) {
      var lvl = 3 + Math.floor(Math.random() * 13);
      var hand = dealHand(lvl);
      if (hand.length !== 27) { bad++; continue; }
      var seen = {}, dup = false;
      for (j = 0; j < hand.length; j++) { if (seen[hand[j].id]) { dup = true; break; } seen[hand[j].id] = 1; }
      if (dup) { bad++; continue; }
      var ev = evaluate(hand, lvl);
      if (!(ev.total >= -20 && ev.total <= 70)) { bad++; continue; }
      var bucket = Math.floor(ev.total / 5) * 5;
      dist[bucket] = (dist[bucket] || 0) + 1;
      tierDist[ev.tier]++;
    }
    msgs.push('共测 ' + n + ' 手，异常 ' + bad + ' 手');
    msgs.push('分数分布（每5分一档）:');
    var keys = [], k;
    for (k in dist) keys.push(parseInt(k, 10));
    keys.sort(function (x, y) { return x - y; });
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      var c = dist[k], bar = '';
      for (j = 0; j < Math.floor(c / (n / 100)); j++) bar += '#';
      msgs.push('  ' + k + '-' + (k + 4) + '分: ' + c + ' ' + bar);
    }
    var tn = ['弱辅助', '辅助', '均衡', '主攻', '强攻'];
    msgs.push('档位分布:');
    for (i = 0; i < 5; i++) msgs.push('  ' + tn[i] + ': ' + (100 * tierDist[i] / n).toFixed(1) + '%');
    return msgs.join('\n');
  }

  return {
    LEVEL_NAMES: LEVEL_NAMES, TIER_NAMES: TIER_NAMES,
    makeDeck: makeDeck, dealHand: dealHand, sortHand: sortHand, shuffle: shuffle,
    sortValue: sortValue, rankLabel: rankLabel, isPei: isPei, cardLabel: cardLabel,
    analyze: analyze, evaluate: evaluate, suggestOpening: suggestOpening,
    classifyRow: classifyRow, buildQuiz: buildQuiz, selfTest: selfTest
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = GuandanEngine; }
