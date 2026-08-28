// url=https://www.figma.com/design/abcdefghijklmnopqrstuv/Fixture-Library?node-id=1-1
// component=Button
export default {
  imports: ["import { Button } from '@/ds/Button';", "import { ButtonVariant } from '@/ds/types';"],
  template: () => figma.code`<Button variant={ButtonVariant.Primary} />`,
};
