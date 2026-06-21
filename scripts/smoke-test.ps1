# Spendes backend smoke test — drives the full flow against a running server.
# Usage: powershell -File scripts/smoke-test.ps1   (server must be up on :3000, Mongo running)
# Uses fresh random phone numbers each run so it never collides with existing data.

$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:3000/api/v1'
$script:pass = 0
$script:fail = 0

function Api($method, $path, $token, $body) {
  $h = @{}
  if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Method = $method; Uri = "$base$path"; Headers = $h; ContentType = 'application/json'; TimeoutSec = 20 }
  if ($null -ne $body) {
    if ($body -is [string]) { $p['Body'] = $body } else { $p['Body'] = ($body | ConvertTo-Json -Depth 12) }
  }
  try {
    $r = Invoke-RestMethod @p
    return [pscustomobject]@{ status = 200; ok = $true; body = $r }
  } catch {
    $st = 0; $txt = ''
    if ($_.Exception.Response) {
      $st = [int]$_.Exception.Response.StatusCode
      try { $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); $txt = $sr.ReadToEnd() } catch {}
    }
    return [pscustomobject]@{ status = $st; ok = $false; body = $txt }
  }
}
function Check($label, $cond, $info) {
  if ($cond) { $script:pass++; Write-Host ("PASS  {0}  {1}" -f $label, $info) }
  else { $script:fail++; Write-Host ("FAIL  {0}  {1}" -f $label, $info) -ForegroundColor Red }
}
function Approx($a, $b) { return [math]::Abs([double]$a - [double]$b) -lt 0.01 }

$rA = Get-Random -Minimum 100000000 -Maximum 999999999
$rB = Get-Random -Minimum 100000000 -Maximum 999999999
$rC = Get-Random -Minimum 100000000 -Maximum 999999999
$rD = Get-Random -Minimum 100000000 -Maximum 999999999
$rF = Get-Random -Minimum 100000000 -Maximum 999999999
$phoneA = "9$rA"; $phoneB = "8$rB"; $phoneC = "7$rC"; $phoneD = "6$rD"; $phoneF = "9$rF"
Write-Host "Phones: A=$phoneA B=$phoneB C=$phoneC D=$phoneD F=$phoneF`n"

# 1. Register user A
Api 'POST' '/auth/otp/request' $null @{ dialCode = '+91'; phoneNumber = $phoneA } | Out-Null
$regA = Api 'POST' '/auth/register' $null @{ dialCode = '+91'; phoneNumber = $phoneA; firstName = 'Smoke'; lastName = 'A'; email = "smoke$rA@example.com"; defaultCurrency = 'INR'; otp = '123456' }
Check 'register A' $regA.ok "status=$($regA.status)"
$tokenA = $regA.body.data.tokens.accessToken
$userIdA = $regA.body.data.user.id
Check 'A plan=free' ($regA.body.data.user.plan -eq 'free') "plan=$($regA.body.data.user.plan)"

# 2. Profile + set UPI id
$me = Api 'GET' '/users/me' $tokenA $null
Check 'GET /users/me' ($me.ok -and $me.body.data.id -eq $userIdA) "id match"
$upd = Api 'PATCH' '/users/me' $tokenA @{ upiId = 'smokeuser@okhdfcbank' }
Check 'set upiId' ($upd.ok -and $upd.body.data.upiId -eq 'smokeuser@okhdfcbank') "upiId=$($upd.body.data.upiId)"

# 3. Personal expense + income
$exp = Api 'POST' '/expenses' $tokenA @{ amount = 250.5; category = 'Food'; paymentMethod = 'upi'; merchant = 'Cafe' }
Check 'create expense' ($exp.ok -and (Approx $exp.body.data.amount 250.5)) "amount=$($exp.body.data.amount)"
$inc = Api 'POST' '/income' $tokenA @{ amount = 50000; category = 'Salary'; receivedVia = 'bank_transfer'; isRecurring = $true }
Check 'create income' ($inc.ok -and (Approx $inc.body.data.amount 50000)) "amount=$($inc.body.data.amount)"
$sum = Api 'GET' '/expenses/summary' $tokenA $null
Check 'expense summary' ($sum.ok) "total=$($sum.body.data.totalAmount)"

# 4. Create group inviting two phones (placeholders)
$grpJson = '{"name":"Smoke Trip","description":"t","currency":"INR","members":[{"phoneNumber":"' + $phoneB + '","displayName":"Bob"},{"phoneNumber":"' + $phoneC + '","displayName":"Charlie"}]}'
$grp = Api 'POST' '/groups' $tokenA $grpJson
Check 'create group' ($grp.ok) "status=$($grp.status)"
$gid = $grp.body.data.id
$mA = ($grp.body.data.members | Where-Object { $_.isYou -eq $true }).id
$mB = ($grp.body.data.members | Where-Object { $_.displayName -eq 'Bob' }).id
$mC = ($grp.body.data.members | Where-Object { $_.displayName -eq 'Charlie' }).id
Check 'group has 3 members' ($grp.body.data.memberCount -eq 3) "count=$($grp.body.data.memberCount)"
$bobReg = ($grp.body.data.members | Where-Object { $_.displayName -eq 'Bob' }).isRegistered
Check 'Bob is invited placeholder' ($bobReg -eq $false) "isRegistered=$bobReg"

# 5. Group expenses (equal + shares)
$eqJson = '{"description":"Dinner","amount":900,"splitStrategy":"equal","paidBy":[{"memberId":"' + $mA + '","amount":900}],"splits":[{"memberId":"' + $mA + '"},{"memberId":"' + $mB + '"},{"memberId":"' + $mC + '"}]}'
$ge1 = Api 'POST' "/groups/$gid/expenses" $tokenA $eqJson
$eqShare = ($ge1.body.data.splits | Where-Object { $_.memberId -eq $mB }).amount
Check 'equal split (900/3=300)' ($ge1.ok -and (Approx $eqShare 300)) "Bob owes=$eqShare"

$shJson = '{"description":"Cab","amount":700,"splitStrategy":"shares","paidBy":[{"memberId":"' + $mB + '","amount":700}],"splits":[{"memberId":"' + $mA + '","shares":2},{"memberId":"' + $mB + '","shares":1},{"memberId":"' + $mC + '","shares":1}]}'
$ge2 = Api 'POST' "/groups/$gid/expenses" $tokenA $shJson
$shareA = ($ge2.body.data.splits | Where-Object { $_.memberId -eq $mA }).amount
Check 'shares split (2:1:1 of 700 -> A=350)' ($ge2.ok -and (Approx $shareA 350)) "A owes=$shareA"

# 5b. Group-expense shares must materialize into the member's PERSONAL expenses
$aShares = Api 'GET' '/expenses?source=group_share' $tokenA $null
$aShareSum = ($aShares.body.data.items | Measure-Object -Property amount -Sum).Sum
Check 'A personal expenses incl. 2 group shares' ($aShares.ok -and $aShares.body.data.items.Count -eq 2) "n=$($aShares.body.data.items.Count)"
Check 'A group-share total = 650 (300+350)' (Approx $aShareSum 650) "sum=$aShareSum"
$sumAll = Api 'GET' '/expenses/summary' $tokenA $null
Check 'expense summary incl. shares = 900.5' (Approx $sumAll.body.data.totalAmount 900.5) "total=$($sumAll.body.data.totalAmount)"
$shareId = $aShares.body.data.items[0].id
$patchShare = Api 'PATCH' "/expenses/$shareId" $tokenA @{ notes = 'x' }
Check 'cannot edit a group-share expense directly -> 400' ($patchShare.status -eq 400) "status=$($patchShare.status)"

# 6. Balances (expected: A=+250, B=+225, C=-475)
$bal = Api 'GET' "/groups/$gid/balances" $tokenA $null
$netA = ($bal.body.data.balances | Where-Object { $_.memberId -eq $mA }).net
$netB = ($bal.body.data.balances | Where-Object { $_.memberId -eq $mB }).net
$netC = ($bal.body.data.balances | Where-Object { $_.memberId -eq $mC }).net
$netSum = [double]$netA + [double]$netB + [double]$netC
Check 'balance A=+250' (Approx $netA 250) "A=$netA"
Check 'balance B=+225' (Approx $netB 225) "B=$netB"
Check 'balance C=-475' (Approx $netC -475) "C=$netC"
Check 'balances sum to 0' (Approx $netSum 0) "sum=$netSum"
Check 'suggestedTransfers present' ($bal.body.data.suggestedTransfers.Count -ge 1) "n=$($bal.body.data.suggestedTransfers.Count)"

# 7. Settlement intent — placeholder (400) vs registered+upi (200)
$si1 = Api 'POST' "/groups/$gid/settlements/intent" $tokenA @{ toMemberId = $mB; amount = 100 }
Check 'intent to placeholder -> 400' ($si1.status -eq 400) "status=$($si1.status)"
$si2 = Api 'POST' "/groups/$gid/settlements/intent" $tokenA @{ toMemberId = $mA; amount = 100 }
$uri = $si2.body.data.uri
Check 'intent to A -> upi:// link' ($si2.ok -and $uri -like 'upi://pay*' -and $uri -like '*smokeuser@okhdfcbank*') "$uri"

# 8. Record settlement (C pays A 250) and re-check balance
$set = Api 'POST' "/groups/$gid/settlements" $tokenA @{ fromMemberId = $mC; toMemberId = $mA; amount = 250; method = 'upi' }
Check 'record settlement' ($set.ok) "status=$($set.status)"
$bal2 = Api 'GET' "/groups/$gid/balances" $tokenA $null
$netA2 = ($bal2.body.data.balances | Where-Object { $_.memberId -eq $mA }).net
$netC2 = ($bal2.body.data.balances | Where-Object { $_.memberId -eq $mC }).net
Check 'after settle: A=0' (Approx $netA2 0) "A=$netA2"
Check 'after settle: C=-225' (Approx $netC2 -225) "C=$netC2"

# 9. Invite-by-phone LINKING: register Bob, then he should be an active member
Api 'POST' '/auth/otp/request' $null @{ dialCode = '+91'; phoneNumber = $phoneB } | Out-Null
$regB = Api 'POST' '/auth/register' $null @{ dialCode = '+91'; phoneNumber = $phoneB; firstName = 'Bob'; lastName = 'B'; email = "smoke$rB@example.com"; otp = '123456' }
Check 'register Bob' $regB.ok "status=$($regB.status)"
$tokenB = $regB.body.data.tokens.accessToken
$grp2 = Api 'GET' "/groups/$gid" $tokenA $null
$bobNow = ($grp2.body.data.members | Where-Object { $_.displayName -eq 'Bob' -or $_.id -eq $mB })
Check 'Bob auto-linked to account' ($bobNow.isRegistered -eq $true -and $bobNow.status -eq 'active') "isRegistered=$($bobNow.isRegistered) status=$($bobNow.status)"
# Bob's pre-join shares (equal 300 + shares 175) should be backfilled into his expenses
$bShares = Api 'GET' '/expenses?source=group_share' $tokenB $null
$bShareSum = ($bShares.body.data.items | Measure-Object -Property amount -Sum).Sum
Check 'Bob group-shares backfilled on register (2)' ($bShares.ok -and $bShares.body.data.items.Count -eq 2) "n=$($bShares.body.data.items.Count)"
Check 'Bob group-share total = 475 (300+175)' (Approx $bShareSum 475) "sum=$bShareSum"

# 10. Non-member cannot see the group (404)
Api 'POST' '/auth/otp/request' $null @{ dialCode = '+91'; phoneNumber = $phoneD } | Out-Null
$regD = Api 'POST' '/auth/register' $null @{ dialCode = '+91'; phoneNumber = $phoneD; firstName = 'Dan'; lastName = 'D'; email = "smoke$rD@example.com"; otp = '123456' }
$tokenD = $regD.body.data.tokens.accessToken
$forbidden = Api 'GET' "/groups/$gid" $tokenD $null
Check 'non-member group access -> 404' ($forbidden.status -eq 404) "status=$($forbidden.status)"

# 11. Lists
$gl = Api 'GET' '/groups' $tokenA $null
Check 'list groups' ($gl.ok -and $gl.body.data.items.Count -ge 1) "n=$($gl.body.data.items.Count)"
$el = Api 'GET' "/groups/$gid/expenses" $tokenA $null
Check 'list group expenses (2)' ($el.ok -and $el.body.data.items.Count -eq 2) "n=$($el.body.data.items.Count)"
$sl = Api 'GET' "/groups/$gid/settlements" $tokenA $null
Check 'list settlements (1)' ($sl.ok -and $sl.body.data.items.Count -eq 1) "n=$($sl.body.data.items.Count)"

# 12. Friends — 1-on-1 direct splits (no group)
$addF = Api 'POST' '/friends' $tokenA @{ phoneNumber = $phoneF; displayName = 'Frank' }
Check 'add friend' ($addF.ok) "status=$($addF.status)"
$fid = $addF.body.data.friendshipId
$fMine = $addF.body.data.myMemberId
$fFriend = $addF.body.data.friendMemberId
Check 'new friend net = 0' (Approx $addF.body.data.net 0) "net=$($addF.body.data.net)"
Check 'friend is a placeholder' ($addF.body.data.isRegistered -eq $false) "isRegistered=$($addF.body.data.isRegistered)"

# Direct friendship must NOT show in the groups list
$gl2 = Api 'GET' '/groups' $tokenA $null
Check 'direct friendship hidden from /groups' ($gl2.body.data.items.Count -eq 1) "groups=$($gl2.body.data.items.Count)"

# Direct split: A pays 500, equal between A and Frank (250 each) -> Frank owes A 250
$fexpJson = '{"description":"Lunch","amount":500,"splitStrategy":"equal","paidBy":[{"memberId":"' + $fMine + '","amount":500}],"splits":[{"memberId":"' + $fMine + '"},{"memberId":"' + $fFriend + '"}]}'
$fexp = Api 'POST' "/friends/$fid/expenses" $tokenA $fexpJson
Check 'friend direct expense created' ($fexp.ok) "status=$($fexp.status)"
$friendGet = Api 'GET' "/friends/$fid" $tokenA $null
Check 'friend net = +250 (Frank owes A)' (Approx $friendGet.body.data.net 250) "net=$($friendGet.body.data.net)"

# A's direct share materializes into personal expenses (now 3 shares: 300+350+250 = 900)
$aShares2 = Api 'GET' '/expenses?source=group_share' $tokenA $null
$aShares2Sum = ($aShares2.body.data.items | Measure-Object -Property amount -Sum).Sum
Check 'A personal expenses incl. friend share (3)' ($aShares2.body.data.items.Count -eq 3) "n=$($aShares2.body.data.items.Count)"
Check 'A share total = 900 (650+250)' (Approx $aShares2Sum 900) "sum=$aShares2Sum"

$fl = Api 'GET' '/friends' $tokenA $null
Check 'friends list: total you are owed = 250' (Approx $fl.body.data.totalYouAreOwed 250) "owed=$($fl.body.data.totalYouAreOwed)"

# Settle intent to a placeholder friend (no UPI id) -> 400
$fInt = Api 'POST' "/friends/$fid/settlements/intent" $tokenA @{ toMemberId = $fFriend; amount = 100 }
Check 'friend intent to placeholder -> 400' ($fInt.status -eq 400) "status=$($fInt.status)"

# Frank settles 250 with A -> net back to 0
$fset = Api 'POST' "/friends/$fid/settlements" $tokenA @{ fromMemberId = $fFriend; toMemberId = $fMine; amount = 250; method = 'cash' }
Check 'friend settlement recorded' ($fset.ok) "status=$($fset.status)"
$friendGet2 = Api 'GET' "/friends/$fid" $tokenA $null
Check 'friend net = 0 after settle' (Approx $friendGet2.body.data.net 0) "net=$($friendGet2.body.data.net)"

# A standard group id is not a friend
$notFriend = Api 'GET' "/friends/$gid" $tokenA $null
Check 'standard group id not a friend -> 404' ($notFriend.status -eq 404) "status=$($notFriend.status)"

# 13. Budgets — "spent" must include personal + group/friend shares for the period
$bFood = Api 'POST' '/budgets' $tokenA @{ name = 'Food'; category = 'Food'; amount = 1000; period = 'monthly' }
Check 'create Food budget' ($bFood.ok) "status=$($bFood.status)"
Check 'Food budget spent = 250.5' (Approx $bFood.body.data.spent 250.5) "spent=$($bFood.body.data.spent)"
Check 'Food budget remaining = 749.5' (Approx $bFood.body.data.remaining 749.5) "remaining=$($bFood.body.data.remaining)"
Check 'Food budget status = ok' ($bFood.body.data.status -eq 'ok') "status=$($bFood.body.data.status)"

$bAll = Api 'POST' '/budgets' $tokenA @{ name = 'Overall'; amount = 1000; period = 'monthly' }
Check 'create overall budget' ($bAll.ok) "status=$($bAll.status)"
Check 'overall spent = 1150.5 (incl. shares)' (Approx $bAll.body.data.spent 1150.5) "spent=$($bAll.body.data.spent)"
Check 'overall budget status = exceeded' ($bAll.body.data.status -eq 'exceeded') "status=$($bAll.body.data.status)"

$bl = Api 'GET' '/budgets' $tokenA $null
Check 'list budgets (2)' ($bl.ok -and $bl.body.data.items.Count -eq 2) "n=$($bl.body.data.items.Count)"

# 14. EMIs — recurring obligations + commitment summary
$emi1 = Api 'POST' '/emis' $tokenA @{ name = 'Home Loan'; type = 'loan'; amount = 15000; frequency = 'monthly'; startDate = '2026-01-05'; tenureCount = 24 }
Check 'create EMI (loan)' ($emi1.ok) "status=$($emi1.status)"
Check 'monthly EMI monthlyEquivalent = amount' (Approx $emi1.body.data.monthlyEquivalent 15000) "me=$($emi1.body.data.monthlyEquivalent)"
$paidPlusRem = [double]$emi1.body.data.installmentsPaid + [double]$emi1.body.data.installmentsRemaining
Check 'EMI paid + remaining = tenure (24)' (Approx $paidPlusRem 24) "sum=$paidPlusRem"
Check 'EMI not completed' ($emi1.body.data.isCompleted -eq $false) "completed=$($emi1.body.data.isCompleted)"

$emi2 = Api 'POST' '/emis' $tokenA @{ name = 'Insurance'; type = 'insurance'; amount = 12000; frequency = 'yearly'; startDate = '2026-03-01' }
Check 'yearly EMI monthlyEquivalent = amount/12' (Approx $emi2.body.data.monthlyEquivalent 1000) "me=$($emi2.body.data.monthlyEquivalent)"

$emi3 = Api 'POST' '/emis' $tokenA @{ name = 'Old Loan'; type = 'loan'; amount = 1000; frequency = 'monthly'; startDate = '2015-01-01'; tenureCount = 3 }
Check 'old finite EMI is completed' ($emi3.body.data.isCompleted -eq $true) "completed=$($emi3.body.data.isCompleted)"
Check 'completed EMI remaining = 0' (Approx $emi3.body.data.installmentsRemaining 0) "rem=$($emi3.body.data.installmentsRemaining)"

$emiSum = Api 'GET' '/emis/summary' $tokenA $null
Check 'EMI summary active = 2 (completed excluded)' ($emiSum.body.data.activeCount -eq 2) "active=$($emiSum.body.data.activeCount)"
Check 'EMI total monthly commitment = 16000' (Approx $emiSum.body.data.totalMonthlyCommitment 16000) "total=$($emiSum.body.data.totalMonthlyCommitment)"

# 15. Goals — target, contributions, progress
$goal = Api 'POST' '/goals' $tokenA @{ name = 'Goa Trip'; targetAmount = 10000; targetDate = '2027-12-31' }
Check 'create goal' ($goal.ok) "status=$($goal.status)"
$gidGoal = $goal.body.data.id
Check 'goal progress 0%' (Approx $goal.body.data.progressPct 0) "pct=$($goal.body.data.progressPct)"
Check 'goal remaining = 10000' (Approx $goal.body.data.remainingAmount 10000) "rem=$($goal.body.data.remainingAmount)"

$c1 = Api 'POST' "/goals/$gidGoal/contribute" $tokenA @{ amount = 2500 }
Check 'contribute 2500' ($c1.ok -and (Approx $c1.body.data.currentAmount 2500)) "current=$($c1.body.data.currentAmount)"
Check 'goal progress 25%' (Approx $c1.body.data.progressPct 25) "pct=$($c1.body.data.progressPct)"

$c2 = Api 'POST' "/goals/$gidGoal/contribute" $tokenA @{ amount = 7500 }
Check 'goal achieved after 10000' ($c2.body.data.isAchieved -eq $true) "achieved=$($c2.body.data.isAchieved)"
Check 'goal progress 100%' (Approx $c2.body.data.progressPct 100) "pct=$($c2.body.data.progressPct)"
Check 'goal remaining = 0' (Approx $c2.body.data.remainingAmount 0) "rem=$($c2.body.data.remainingAmount)"
Check 'goal has 2 contributions' ($c2.body.data.contributions.Count -eq 2) "n=$($c2.body.data.contributions.Count)"

# 16. Investments — holdings, gain/loss, portfolio summary
$inv1 = Api 'POST' '/investments' $tokenA @{ name = 'Index Fund'; type = 'mutual_fund'; investedAmount = 10000; currentValue = 12000 }
Check 'create investment' ($inv1.ok) "status=$($inv1.status)"
Check 'investment gain = 2000' (Approx $inv1.body.data.gainLoss 2000) "gl=$($inv1.body.data.gainLoss)"
Check 'investment gain% = 20' (Approx $inv1.body.data.gainLossPct 20) "pct=$($inv1.body.data.gainLossPct)"

$inv2 = Api 'POST' '/investments' $tokenA @{ name = 'ACME Stock'; type = 'stock'; investedAmount = 5000; currentValue = 4000 }
Check 'investment loss = -1000' (Approx $inv2.body.data.gainLoss -1000) "gl=$($inv2.body.data.gainLoss)"

$invSum = Api 'GET' '/investments/summary' $tokenA $null
Check 'portfolio invested = 15000' (Approx $invSum.body.data.totalInvested 15000) "inv=$($invSum.body.data.totalInvested)"
Check 'portfolio value = 16000' (Approx $invSum.body.data.totalCurrentValue 16000) "val=$($invSum.body.data.totalCurrentValue)"
Check 'portfolio gain = 1000' (Approx $invSum.body.data.totalGainLoss 1000) "gl=$($invSum.body.data.totalGainLoss)"
Check 'portfolio has 2 allocations' ($invSum.body.data.allocation.Count -eq 2) "n=$($invSum.body.data.allocation.Count)"

# 17. Analytics — the cross-module dashboard
$ov = Api 'GET' '/analytics/overview' $tokenA $null
Check 'overview income = 50000' (Approx $ov.body.data.income 50000) "income=$($ov.body.data.income)"
Check 'overview expense = 1150.5 (incl. shares)' (Approx $ov.body.data.expense 1150.5) "expense=$($ov.body.data.expense)"
Check 'overview net = 48849.5' (Approx $ov.body.data.net 48849.5) "net=$($ov.body.data.net)"
Check 'overview savingsRate = 97.7' (Approx $ov.body.data.savingsRate 97.7) "rate=$($ov.body.data.savingsRate)"
Check 'overview monthly commitment = 16000' (Approx $ov.body.data.commitments.totalMonthlyCommitment 16000) "c=$($ov.body.data.commitments.totalMonthlyCommitment)"
Check 'overview portfolio value = 16000' (Approx $ov.body.data.portfolio.totalCurrentValue 16000) "v=$($ov.body.data.portfolio.totalCurrentValue)"
Check 'overview net-worth assets = 26000 (16000+10000)' (Approx $ov.body.data.netWorth.assets 26000) "a=$($ov.body.data.netWorth.assets)"
Check 'overview top category = Group' ($ov.body.data.topCategories[0].category -eq 'Group') "top=$($ov.body.data.topCategories[0].category)"
# New interconnections: owe/owed balances (Frank settled -> net 0) + compact goals readout
Check 'overview balances net = 0 (friend settled)' (Approx $ov.body.data.balances.net 0) "net=$($ov.body.data.balances.net)"
Check 'overview goals.activeCount = 1' ($ov.body.data.goals.activeCount -eq 1) "n=$($ov.body.data.goals.activeCount)"
Check 'overview goals allOnTrack (achieved goal needs 0)' ($ov.body.data.goals.allOnTrack -eq $true) "allOnTrack=$($ov.body.data.goals.allOnTrack)"
Check 'overview portfolio.totalMonthlySip = 0 (no SIP yet)' (Approx $ov.body.data.portfolio.totalMonthlySip 0) "sip=$($ov.body.data.portfolio.totalMonthlySip)"

$cf = Api 'GET' '/analytics/cashflow?months=6' $tokenA $null
Check 'cashflow has 6 months' ($cf.body.data.series.Count -eq 6) "n=$($cf.body.data.series.Count)"
Check 'cashflow total income = 50000' (Approx $cf.body.data.totalIncome 50000) "ti=$($cf.body.data.totalIncome)"
Check 'cashflow total expense = 1150.5' (Approx $cf.body.data.totalExpense 1150.5) "te=$($cf.body.data.totalExpense)"

# 18. Investments SIP — recurring plan + contribution history
$invSip = Api 'POST' '/investments' $tokenA @{ name = 'SIP Index'; type = 'mutual_fund'; investedAmount = 6000; currentValue = 6000; sip = @{ amount = 2000; frequency = 'monthly'; startDate = '2026-01-05' } }
Check 'create SIP investment' ($invSip.ok) "status=$($invSip.status)"
$invSipId = $invSip.body.data.id
Check 'SIP monthlyEquivalent = 2000' (Approx $invSip.body.data.sip.monthlyEquivalent 2000) "me=$($invSip.body.data.sip.monthlyEquivalent)"
Check 'initial contribution seeded (1)' ($invSip.body.data.contributions.Count -eq 1) "n=$($invSip.body.data.contributions.Count)"
Check 'investedAmount = sum(contributions) = 6000' (Approx $invSip.body.data.investedAmount 6000) "inv=$($invSip.body.data.investedAmount)"
Check 'SIP has a nextContributionDate' ($null -ne $invSip.body.data.sip.nextContributionDate) "next=$($invSip.body.data.sip.nextContributionDate)"

# Record one SIP installment and refresh market value in the same call
$contrib = Api 'POST' "/investments/$invSipId/contribute" $tokenA @{ amount = 2000; note = 'SIP installment'; currentValue = 8500 }
Check 'contribution recorded (201)' ($contrib.status -eq 200 -or $contrib.ok) "status=$($contrib.status)"
Check 'investedAmount grew to 8000' (Approx $contrib.body.data.investedAmount 8000) "inv=$($contrib.body.data.investedAmount)"
Check 'now 2 contributions' ($contrib.body.data.contributions.Count -eq 2) "n=$($contrib.body.data.contributions.Count)"
Check 'currentValue refreshed to 8500' (Approx $contrib.body.data.currentValue 8500) "val=$($contrib.body.data.currentValue)"

$invSum2 = Api 'GET' '/investments/summary' $tokenA $null
Check 'portfolio totalMonthlySip = 2000' (Approx $invSum2.body.data.totalMonthlySip 2000) "sip=$($invSum2.body.data.totalMonthlySip)"

# 19. Goal feasibility — disposable income vs required saving
$feas = Api 'GET' '/analytics/goals' $tokenA $null
Check 'feasibility ok' ($feas.ok) "status=$($feas.status)"
Check 'feasibility basisMonths = 3' ($feas.body.data.monthly.basisMonths -eq 3) "b=$($feas.body.data.monthly.basisMonths)"
Check 'feasibility emiCommitment = 16000' (Approx $feas.body.data.monthly.emiCommitment 16000) "emi=$($feas.body.data.monthly.emiCommitment)"
Check 'feasibility sipCommitment = 2000' (Approx $feas.body.data.monthly.sipCommitment 2000) "sip=$($feas.body.data.monthly.sipCommitment)"
Check 'feasibility activeGoals = 1' ($feas.body.data.totals.activeGoals -eq 1) "n=$($feas.body.data.totals.activeGoals)"
Check 'achieved goal needs 0/month -> onTrack' ($feas.body.data.goals[0].onTrack -eq $true) "onTrack=$($feas.body.data.goals[0].onTrack)"
Check 'achieved goal required = 0' (Approx $feas.body.data.goals[0].requiredMonthlySaving 0) "req=$($feas.body.data.goals[0].requiredMonthlySaving)"

# 20. App update prompt — public version check (fails open with no config) + admin guard
$verOld = Api 'GET' '/app/version?platform=android&version=1.0.0' $null $null
Check 'version check is public (no auth)' ($verOld.ok) "status=$($verOld.status)"
Check 'no config -> updateAvailable false (fail open)' ($verOld.body.data.updateAvailable -eq $false) "upd=$($verOld.body.data.updateAvailable)"
Check 'no config -> forceUpdate false (fail open)' ($verOld.body.data.forceUpdate -eq $false) "force=$($verOld.body.data.forceUpdate)"
$verBad = Api 'GET' '/app/version?platform=android&version=not-a-version' $null $null
Check 'invalid version -> 400' ($verBad.status -eq 400) "status=$($verBad.status)"
$verAdmin = Api 'PUT' '/app/version/android' $tokenA @{ latestVersion = '2.0.0'; minSupportedVersion = '1.5.0'; storeUrl = 'https://play.google.com/store/apps/details?id=com.spendes' }
Check 'non-admin cannot set version config -> 403' ($verAdmin.status -eq 403) "status=$($verAdmin.status)"

# Unauthorized check
$noauth = Api 'GET' '/users/me' $null $null
Check 'no token -> 401' ($noauth.status -eq 401) "status=$($noauth.status)"

$resultColor = 'Green'; if ($script:fail -gt 0) { $resultColor = 'Red' }
Write-Host ("`n==== RESULT: {0} passed, {1} failed ====" -f $script:pass, $script:fail) -ForegroundColor $resultColor
