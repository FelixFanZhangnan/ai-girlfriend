const str = '是我的话就一句话：哥们，我不干了。明天给我办离职。';
const messageMatch = str.match(/^([^:：\s，。！？,!?]{1,20})[：:]\s*(.*)$/);
console.log(messageMatch);

// We want to make sure it doesn't match this line. It's matching because "是我的话就一句话" doesn't contain spaces or periods.
// Another rule: It's extremely unlikely for a real username to end immediately before a colon if the line is over e.g. 30 chars, UNLESS it's a standard export.
// Actually, standard WeChat exports ALWAYS have a space after the name or include a date.
// If it's a raw copy-paste from Mac WeChat, it doesn't have colons at all! "Name Time" format!
// Let's refine the logic.
