import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Primitives";

/** Один ответ на «нет такой», «истекла» и «повреждена» — не выдаём, что из трёх. */
export default function SharedNotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <EmptyState
        title="Ссылка недействительна"
        description="Она могла истечь (ссылки живут 30 дней), быть скопирована не целиком или указывать на подборку, которой больше нет. Попросите отправителя создать новую."
        action={
          <ButtonLink href="/" variant="outline">
            На главную
          </ButtonLink>
        }
      />
    </div>
  );
}
