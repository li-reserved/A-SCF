import { handleNewsStream } from '../../scripts/news-service.mjs';

export default function handler(req, res) {
  handleNewsStream(req, res);
}
