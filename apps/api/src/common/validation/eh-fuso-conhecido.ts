import { registerDecorator, ValidationOptions } from "class-validator";
import { fusoConhecido } from "../tempo";

/**
 * Recusa um fuso que este ambiente não reconhece.
 *
 * Sem isto, `timezone` era um campo de texto livre que ia direto para o
 * `Intl`, e qualquer valor sem sentido gravado uma vez derrubava o dashboard,
 * a ficha de todo lead e a exportação do Google com `RangeError`. Um 400 na
 * hora de salvar é a diferença entre um campo digitado errado e um sistema
 * que só volta ao ar editando o banco na mão.
 */
export function EhFusoConhecido(opcoes?: ValidationOptions) {
  return function (objeto: object, propriedade: string): void {
    registerDecorator({
      name: "ehFusoConhecido",
      target: objeto.constructor,
      propertyName: propriedade,
      options: opcoes,
      validator: {
        validate: (valor: unknown) => typeof valor === "string" && fusoConhecido(valor),
        defaultMessage: () => "Fuso horário desconhecido. Use um nome como America/Sao_Paulo.",
      },
    });
  };
}
