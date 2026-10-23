/** One buyer's deployed operators share a health percentage and the highest independent ATK. */
export class TrophyUnity {
  constructor(battle, ownerId) {
    this.battle = battle;
    this.ownerId = ownerId;
    this.ratio = 1;
    this.attackDirty = true;
    this.readingAttack = false;
    this.dying = false;
  }

  members() { return this.battle.allyUnits.filter(u => u.trophyUnity === this && u.alive && u.deployed); }

  join(unit) {
    this.attackDirty = true;
    const others = this.members().filter(u => u !== unit);
    if (!others.length) this.ratio = unit.hp / unit.s.maxHp;
    unit.hp = unit.s.maxHp * this.ratio;
  }

  syncAttack() {
    if (this.readingAttack || !this.attackDirty) return;
    this.readingAttack = true;
    const units = this.members();
    let highest = 0;
    for (const unit of units) {
      if (unit._dirty) unit._recalc();
      unit._s.atk = unit._nativeAtk;
      highest = Math.max(highest, unit._nativeAtk);
    }
    for (const unit of units) unit._s.atk = highest;
    this.attackDirty = false;
    this.readingAttack = false;
  }

  syncHealth() {
    const units = this.members();
    let total = 0, health = 0;
    for (const unit of units) { total += unit.s.maxHp; health += unit.hp; }
    this.ratio = total > 0 ? Math.max(0, Math.min(1, health / total)) : 0;
    for (const unit of units) unit.hp = unit.s.maxHp * this.ratio;
    return { units, total };
  }

  damage(amount) {
    const { units, total } = this.syncHealth();
    const before = this.ratio;
    this.ratio = Math.max(0, before - amount / total);
    if (this.ratio === 0) this.dying = true;
    return units.map(unit => {
      const max = unit.s.maxHp;
      unit.hp = max * this.ratio;
      return { unit, amount: amount * max / total, dealt: max * (before - this.ratio) };
    });
  }

  heal(amount) {
    if (this.dying) return 0;
    const { units, total } = this.syncHealth();
    const actual = Math.min(amount, total * (1 - this.ratio));
    if (total > 0) this.ratio = Math.min(1, this.ratio + actual / total);
    for (const unit of units) unit.hp = unit.s.maxHp * this.ratio;
    return actual;
  }

  kill(killer) {
    const units = this.members();
    this.dying = true;
    this.ratio = 0;
    for (const unit of units) unit.hp = 0;
    for (const unit of units) this.battle.kill(unit, killer);
    this.dying = false;
  }
}
