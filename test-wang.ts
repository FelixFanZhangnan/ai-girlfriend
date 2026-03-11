import { parseWeChatChatLog } from './src/service/chatLogParser';

const log = parseWeChatChatLog('./wang.txt');
console.log('Participants:', log.participants);
console.log('Total Messages:', log.messages.length);
console.log('First 3 Messages:', log.messages.slice(0, 3));
